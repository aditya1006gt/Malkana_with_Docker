interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
}
export declare function uploadImageToS3(file: MulterFile): Promise<string>;
export declare function deleteImageFromS3(imageUrl: string): Promise<void>;
export {};
//# sourceMappingURL=s3.d.ts.map