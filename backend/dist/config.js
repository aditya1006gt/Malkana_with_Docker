import dotenv from 'dotenv';
dotenv.config();
export const config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
        url: process.env.DATABASE_URL || ''
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    },
    aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        s3Bucket: process.env.AWS_S3_BUCKET || ''
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production'
};
//# sourceMappingURL=config.js.map