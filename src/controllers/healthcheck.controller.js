import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const healthcheck = asyncHandler(async (req, res) => {
    // Return a simple OK status to confirm the server is alive
    return res
        .status(200)
        .json(new ApiResponse(200, { status: "ok" }, "Server is running"))
})

export {
    healthcheck
    }