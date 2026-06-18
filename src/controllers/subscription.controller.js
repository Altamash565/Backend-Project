import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const {channelId} = req.params

    // Validate the channelId format
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID")
    }

    // A user cannot subscribe to their own channel
    if (channelId === req.user._id.toString()) {
        throw new ApiError(400, "You cannot subscribe to your own channel")
    }

    // Check if a subscription already exists
    const existingSubscription = await Subscription.findOne({
        subscriber: req.user._id,
        channel: channelId
    })

    if (existingSubscription) {
        // Already subscribed → remove the subscription (unsubscribe)
        await Subscription.findByIdAndDelete(existingSubscription._id)

        return res
            .status(200)
            .json(new ApiResponse(200, { isSubscribed: false }, "Unsubscribed successfully"))
    }

    // Not subscribed yet → create a new subscription
    await Subscription.create({
        subscriber: req.user._id,
        channel: channelId
    })

    return res
        .status(200)
        .json(new ApiResponse(200, { isSubscribed: true }, "Subscribed successfully"))
})

// Controller to return the subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const {subscriberId} = req.params

    // Validate the subscriberId (which represents the channel here)
    if (!isValidObjectId(subscriberId)) {
        throw new ApiError(400, "Invalid channel ID")
    }

    // Use aggregation to get subscribers with their profile details
    const subscribers = await Subscription.aggregate([
        {
            // Step 1: Filter — find all subscriptions where channel = this user
            $match: {
                channel: new mongoose.Types.ObjectId(subscriberId)
            }
        },
        {
            // Step 2: Join — attach subscriber's profile info
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
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
            // Step 3: Flatten — turn the subscriber array into a single object
            $addFields: {
                subscriber: { $first: "$subscriber" }
            }
        }
    ])

    return res
        .status(200)
        .json(new ApiResponse(200, subscribers, "Subscribers fetched successfully"))
})

// Controller to return the channel list a user has subscribed to
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { channelId } = req.params

    // Validate the channelId format
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID")
    }

    // Use aggregation to get channels with their profile details
    const subscribedChannels = await Subscription.aggregate([
        {
            // Step 1: Filter — find all subscriptions where subscriber = this user
            $match: {
                subscriber: new mongoose.Types.ObjectId(channelId)
            }
        },
        {
            // Step 2: Join — attach channel's profile info
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "channel",
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
            // Step 3: Flatten — turn the channel array into a single object
            $addFields: {
                channel: { $first: "$channel" }
            }
        }
    ])

    return res
        .status(200)
        .json(new ApiResponse(200, subscribedChannels, "Subscribed channels fetched successfully"))
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}