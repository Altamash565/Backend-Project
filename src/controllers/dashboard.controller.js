import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getChannelStats = asyncHandler(async (req, res) => {
    /*
     * STEP 1 — EXTRACT
     * The logged-in user IS the channel owner.
     * Their _id is injected by your auth middleware into req.user.
     */
    const userId = req.user._id

    /*
     * STEP 2 — EXECUTE (Business Logic)
     *
     * We need 3 different pieces of data:
     *   a) Total videos + total views  →  query the Video collection
     *   b) Total subscribers           →  query the Subscription collection
     *   c) Total likes on their videos →  query the Like collection
     *
     * Instead of awaiting them one-by-one (slow), we fire all 3 at the SAME
     * time using Promise.all. The dashboard loads 3× faster this way.
     */
    const [videoStats, subscriberCount, likesCount] = await Promise.all([

        // --- a) Video stats via Aggregation Pipeline ---
        // Aggregation lets the DATABASE do the heavy math, not Node.js.
        Video.aggregate([
            {
                // $match = "WHERE" in SQL — only look at THIS user's videos
                $match: { owner: new mongoose.Types.ObjectId(userId) }
            },
            {
                // $group = "GROUP BY" — merge all matched docs into ONE result
                $group: {
                    _id: null,                        // null = group everything together
                    totalVideos: { $sum: 1 },         // count each document as 1
                    totalViews:  { $sum: "$views" }   // sum the 'views' field
                }
            }
        ]),

        // --- b) Subscriber count — simple countDocuments ---
        // "How many Subscription docs have channel = this user?"
        Subscription.countDocuments({ channel: userId }),

        // --- c) Likes on this user's videos via Aggregation ---
        Like.aggregate([
            {
                // Only consider likes that are on a Video (not tweet/comment likes)
                $match: { video: { $exists: true, $ne: null } }
            },
            {
                // $lookup = "JOIN" — attach the video document to each like
                $lookup: {
                    from: "videos",         // the MongoDB collection name (lowercase plural)
                    localField: "video",    // field in Like doc
                    foreignField: "_id",    // field in Video doc
                    as: "videoDetails"      // output array name
                }
            },
            {
                // $lookup returns an array; $unwind flattens it to a plain object
                $unwind: "$videoDetails"
            },
            {
                // Now filter: keep only likes whose video belongs to this user
                $match: {
                    "videoDetails.owner": new mongoose.Types.ObjectId(userId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalLikes: { $sum: 1 }
                }
            }
        ])
    ])

    /*
     * STEP 3 — FORMAT
     * Aggregation returns an array. If a user has 0 videos, videoStats = [].
     * videoStats[0] would be undefined and crash → use optional chaining ?. 
     * and the OR || 0 fallback to safely default to zero.
     */
    const stats = {
        totalVideos:     videoStats[0]?.totalVideos  || 0,
        totalViews:      videoStats[0]?.totalViews   || 0,
        totalSubscribers: subscriberCount,
        totalLikes:      likesCount[0]?.totalLikes   || 0
    }

    /*
     * STEP 4 — RESPOND
     * Always use your ApiResponse wrapper so every endpoint stays consistent.
     */
    return res
        .status(200)
        .json(new ApiResponse(200, stats, "Channel stats fetched successfully"))
})

const getChannelVideos = asyncHandler(async (req, res) => {
    /*
     * STEP 1 — EXTRACT
     * Same as above — the logged-in user is the channel owner.
     */
    const userId = req.user._id

    /*
     * STEP 2 — EXECUTE
     * Simple find query: "Give me every Video where owner = this user"
     * .sort({ createdAt: -1 }) → newest video first (professional default)
     */
    const videos = await Video.find({ owner: userId }).sort({ createdAt: -1 })

    /*
     * STEP 3 — RESPOND
     */
    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Channel videos fetched successfully"))
})

export {
    getChannelStats, 
    getChannelVideos
    }