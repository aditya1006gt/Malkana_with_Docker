import express from "express";
import multer from "multer";
import authMiddleware from "../middleware.js";
import { uploadImageToS3 } from "../utils/s3.js";
const router = express.Router();
// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only images
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        }
        else {
            cb(new Error("Only image files are allowed!"));
        }
    },
});
// Upload single image
router.post("/image", authMiddleware, upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }
        const imageUrl = await uploadImageToS3(req.file);
        return res.json({
            success: true,
            imageUrl: imageUrl,
        });
    }
    catch (error) {
        console.error("Upload error:", error);
        return res.status(500).json({ error: error.message });
    }
});
export default router;
//# sourceMappingURL=upload.js.map