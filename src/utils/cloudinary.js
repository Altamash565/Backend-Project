import { v2 as cloudinary } from "cloudinary";
import fs from "fs"


    // Configuration
    cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
        api_key: process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET  // Click 'View API Keys' above to copy your API secret
    });

    const uploadOncloudinary = async (localfilePath) => {
        try {
            if (!localfilePath) return null 
            
            // Check file extension to determine if it is a video
            const isVideo = localfilePath.match(/\.(mp4|mkv|mov|avi|webm|flv|3gp|wmv)$/i);
            
            let response;
            if (isVideo) {
                // For videos, use upload_large to handle potentially large files and avoid timeouts
                response = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_large(localfilePath, { 
                        resource_type: "video",
                        chunk_size: 6000000 // 6MB chunk size
                    }, (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    })
                });
            } else {
                response = await cloudinary.uploader.upload(localfilePath, { 
                    resource_type: "auto"
                })
            }

            //file has been uploaded successfully
            console.log("File is uploaded on cloudinary", response.url);
            if (fs.existsSync(localfilePath)) {
                fs.unlinkSync(localfilePath)
            }
            return response;
            
        } catch (error) {
            console.error("Error uploading to Cloudinary:", error);
            if (fs.existsSync(localfilePath)) {
                fs.unlinkSync(localfilePath)  // remove the locally saved file as the upload operation got failed;  
            }
            return null;
        }
    }
    

export {uploadOncloudinary} 