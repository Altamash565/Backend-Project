import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    const {content} = req.body

    // Validate that content is provided
    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content is required")
    }

    // Create the tweet, owned by the logged-in user
    const tweet = await Tweet.create({
        content: content.trim(),
        owner: req.user._id
    })

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully"))
})

const getUserTweets = asyncHandler(async (req, res) => {
    const {userId} = req.params

    // Validate the userId format
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID")
    }

    // Use aggregation to fetch tweets with owner details and like count
    const tweets = await Tweet.aggregate([
        {
            // Step 1: Filter — only tweets by this user
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            // Step 2: Join — attach the owner's profile info
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
            // Step 3: Join — count the likes on each tweet
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "tweet",
                as: "likes"
            }
        },
        {
            // Step 4: Add computed fields
            $addFields: {
                owner: { $first: "$owner" },
                likesCount: { $size: "$likes" }
            }
        },
        {
            // Step 5: Remove the raw likes array (we only need the count)
            $project: {
                likes: 0
            }
        },
        {
            // Step 6: Sort — newest tweets first
            $sort: { createdAt: -1 }
        }
    ])

    return res
        .status(200)
        .json(new ApiResponse(200, tweets, "User tweets fetched successfully"))
})

const updateTweet = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    const {content} = req.body

    // Validate inputs
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID")
    }

    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content is required")
    }

    // Find the tweet first to check ownership
    const tweet = await Tweet.findById(tweetId)

    if (!tweet) {
        throw new ApiError(404, "Tweet not found")
    }

    // Only the tweet owner can update it
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only edit your own tweets")
    }

    // Update the content
    tweet.content = content.trim()
    const updatedTweet = await tweet.save()

    return res
        .status(200)
        .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"))
})

const deleteTweet = asyncHandler(async (req, res) => {
    const {tweetId} = req.params

    // Validate the tweetId format
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID")
    }

    // Find the tweet first to check ownership
    const tweet = await Tweet.findById(tweetId)

    if (!tweet) {
        throw new ApiError(404, "Tweet not found")
    }

    // Only the tweet owner can delete it
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only delete your own tweets")
    }

    await Tweet.findByIdAndDelete(tweetId)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully"))
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}