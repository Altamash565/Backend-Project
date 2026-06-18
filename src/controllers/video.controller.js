import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOncloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy = "createdAt", sortType = "desc", userId } = req.query

    // Build the $match filter dynamically based on what query params were sent
    const matchStage = {}

    // If a search query is provided, search in title and description
    if (query) {
        matchStage.$or = [
            { title: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } }
        ]
    }

    // If a userId is provided, filter by that user's videos
    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid user ID")
        }
        matchStage.owner = new mongoose.Types.ObjectId(userId)
    }

    // Only show published videos
    matchStage.ispublished = true

    // Build the aggregation pipeline
    const videosAggregate = Video.aggregate([
        {
            $match: matchStage
        },
        {
            // Join — attach the owner's profile info to each video
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullname: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            // Flatten the owner array into a single object
            $addFields: {
                owner: { $first: "$owner" }
            }
        },
        {
            // Sort dynamically based on query params (e.g., createdAt desc, views asc)
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        }
    ])

    // Use mongoose-aggregate-paginate-v2 for automatic pagination
    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    }

    const videos = await Video.aggregatePaginate(videosAggregate, options)

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body

    // Validate that title and description are provided
    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description are both required")
    }

    // Get the local file paths from multer (uploaded via form-data)
    const videoFileLocalPath = req.files?.videoFile?.[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required")
    }

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required")
    }

    // Upload both files to Cloudinary in parallel
    const [videoFile, thumbnail] = await Promise.all([
        uploadOncloudinary(videoFileLocalPath),
        uploadOncloudinary(thumbnailLocalPath)
    ])

    if (!videoFile) {
        throw new ApiError(500, "Failed to upload video file")
    }

    if (!thumbnail) {
        throw new ApiError(500, "Failed to upload thumbnail")
    }

    // Create the video document in the database
    const video = await Video.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        title: title.trim(),
        description: description.trim(),
        duration: videoFile.duration,    // Cloudinary returns duration for video files
        owner: req.user._id
    })

    return res
        .status(201)
        .json(new ApiResponse(201, video, "Video published successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Validate the videoId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Use aggregation to get video with owner details and like count
    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            // Join — attach the owner's profile info
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullname: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            // Join — count the likes on this video
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $addFields: {
                owner: { $first: "$owner" },
                likesCount: { $size: "$likes" },
                // Check if the current user has liked this video
                isLiked: {
                    $in: [req.user._id, "$likes.likedBy"]
                }
            }
        },
        {
            // Remove the raw likes array (we only need count + isLiked)
            $project: {
                likes: 0
            }
        }
    ])

    if (!video?.length) {
        throw new ApiError(404, "Video not found")
    }

    // Increment the view count by 1
    await Video.findByIdAndUpdate(videoId, {
        $inc: { views: 1 }
    })

    // Add this video to the user's watch history
    await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { watchHistory: videoId }
    })

    return res
        .status(200)
        .json(new ApiResponse(200, video[0], "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body

    // Validate the videoId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Find the video first to check ownership
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Only the video owner can update it
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only update your own videos")
    }

    // Update title and description if provided
    if (title?.trim()) video.title = title.trim()
    if (description?.trim()) video.description = description.trim()

    // If a new thumbnail was uploaded, upload it to Cloudinary
    const thumbnailLocalPath = req.file?.path

    if (thumbnailLocalPath) {
        const thumbnail = await uploadOncloudinary(thumbnailLocalPath)

        if (!thumbnail) {
            throw new ApiError(500, "Failed to upload thumbnail")
        }

        video.thumbnail = thumbnail.url
    }

    const updatedVideo = await video.save()

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Validate the videoId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Find the video first to check ownership
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Only the video owner can delete it
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only delete your own videos")
    }

    await Video.findByIdAndDelete(videoId)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Validate the videoId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Find the video first to check ownership
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Only the video owner can change publish status
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only modify your own videos")
    }

    // Flip the ispublished flag
    video.ispublished = !video.ispublished
    const updatedVideo = await video.save()

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updatedVideo,
                `Video ${updatedVideo.ispublished ? "published" : "unpublished"} successfully`
            )
        )
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}