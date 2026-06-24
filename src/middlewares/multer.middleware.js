import multer from "multer";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/temp")
  },
  
  filename: function (req, file, cb) {
    // Sanitize filename to prevent path traversal attacks
    const sanitized = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    cb(null, sanitized + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
  }
})

export const upload = multer({ 
    storage,
    // Limit file size to 100MB to prevent disk exhaustion
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB
    },
    fileFilter: (req, file, cb) => {
      // Optional: Add MIME type validation
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed`));
      }
    }
})