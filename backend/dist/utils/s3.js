import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
export async function uploadImageToS3(file) {
    const fileExtension = file.originalname.split(".").pop();
    const fileName = `blog-images/${uuidv4()}.${fileExtension}`;
    const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
    };
    try {
        await s3Client.send(new PutObjectCommand(uploadParams));
        return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }
    catch (error) {
        console.error("Error uploading to S3:", error);
        throw new Error("Failed to upload image");
    }
}
export async function deleteImageFromS3(imageUrl) {
    const key = imageUrl.split(".amazonaws.com/")[1];
    const deleteParams = {
        Bucket: BUCKET_NAME,
        Key: key,
    };
    try {
        await s3Client.send(new DeleteObjectCommand(deleteParams));
    }
    catch (error) {
        console.error("Error deleting from S3:", error);
        throw new Error("Failed to delete image");
    }
}
//# sourceMappingURL=s3.js.map