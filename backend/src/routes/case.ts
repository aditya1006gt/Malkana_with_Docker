import express from "express";
import { prisma } from "../lib/prisma.js";
import authMiddleware from "../middleware.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import multer from "multer";
import { uploadImageToS3 } from "../utils/s3.js";
import type { Prisma } from '../generated/prisma/client.js';

const router = express.Router();

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed!"));
        }
    },
});

// Validation Schema for creating a Case
const propertySchema = z.object({
    category: z.enum(["ELECTRONICS", "WEAPON", "VEHICLE", "CASH", "NARCOTICS", "DOCUMENTS", "OTHER"]),
    belongingTo: z.enum(["ACCUSED", "COMPLAINANT", "VICTIM", "UNKNOWN"]),
    nature: z.enum(["RECOVERED", "SEIZED", "ABANDONED"]),
    quantity: z.number().int().positive(),
    location: z.string().min(1),
    description: z.string().min(1),
    photoUrl: z.string().url().optional(),
});

const createCaseSchema = z.object({
    policeStation: z.string().min(1),
    ioName: z.string().min(1),
    ioId: z.string().min(1),
    crimeYear: z.number().int(),
    firDate: z.string().datetime(),
    seizureDate: z.string().datetime(),
    actLaw: z.string().min(1),
    sectionLaw: z.string().min(1),
    properties: z.array(propertySchema).optional(),
});

// 1. Create a New Case (with optional properties and image upload)
router.post("/create", authMiddleware, upload.array("images", 10), async (req, res) => {
    try {
        // Parse properties from JSON string if it comes from FormData
        let parsedBody = { ...req.body };
        if (typeof req.body.properties === 'string') {
            try {
                parsedBody.properties = JSON.parse(req.body.properties);
            } catch (e) {
                return res.status(400).json({ error: "Invalid properties format" });
            }
        }

        // Parse numbers that come as strings from FormData
        if (typeof parsedBody.crimeYear === 'string') {
            parsedBody.crimeYear = parseInt(parsedBody.crimeYear);
        }

        const validation = createCaseSchema.safeParse(parsedBody);
        if (!validation.success) {
            return res.status(400).json({ error: "Invalid inputs", details: validation.error.issues });
        }

        const userId = req.userId!;
        const { policeStation, ioName, ioId, crimeYear, firDate, seizureDate, actLaw, sectionLaw, properties } = parsedBody;

        // Upload images to S3 if provided
        let uploadedImageUrls: string[] = [];
        if (req.files && Array.isArray(req.files)) {
            uploadedImageUrls = await Promise.all(
                req.files.map(file => uploadImageToS3(file))
            );
        }

        // Generate QR Codes and assign images to properties
        const propertiesWithQR = await Promise.all((properties || []).map(async (p: any, index: number) => {
            const token = `PROP-${uuidv4()}`;
            const qr = await QRCode.toDataURL(token);
            return { 
                ...p, 
                qrString: token, 
                qrCodeImage: qr,
                photoUrl: uploadedImageUrls[index] || p.photoUrl || null // Use uploaded image or provided URL
            };
        }));

        // Find Serial Number
        const lastCase = await prisma.caseRecord.findFirst({
            where: { crimeYear },
            orderBy: { createdAt: 'desc' }
        });

        let nextSequence = 1;
        if (lastCase?.crimeNumber) {
            const parts = lastCase.crimeNumber.split('-');
            const lastNum = parseInt(parts[parts.length - 1] ?? '0', 10);
            if (!isNaN(lastNum)) nextSequence = lastNum + 1;
        }
        const autoCrimeNumber = `FIR-${crimeYear}-${nextSequence.toString().padStart(3, '0')}`;

        // Create Case and Properties
        const newCase = await prisma.caseRecord.create({
            data: {
                policeStation, ioName, ioId, crimeNumber: autoCrimeNumber,
                crimeYear, actLaw, sectionLaw, userId,
                firDate: new Date(firDate),
                seizureDate: new Date(seizureDate),
                properties: { create: propertiesWithQR }
            },
            include: { properties: true }
        });

        return res.status(201).json({ message: "Registered successfully", case: newCase });

    } catch (err: any) {
        console.error("DEBUG ERROR:", err);
        return res.status(500).json({ error: "DB Connection Error", details: err.message });
    }
});

// 2. Get All Cases for the Logged-in Officer
router.get("/my-cases", authMiddleware, async (req, res) => {
    try {
        const userId = req.userId!;
        const cases = await prisma.caseRecord.findMany({
            where: { userId },
            include: {
                _count: { select: { properties: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        return res.json({ cases });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch cases" });
    }
});

// 3. Get Specific Case Details
router.get("/specific/:id", authMiddleware, async (req, res) => {
    try {
        const id = req.params.id as string; // Type assertion
        if (!id) return res.status(400).json({ error: "Case ID is required" });
        console.log("Request received for ID:", id);
        
        const foundCase = await prisma.caseRecord.findFirst({
            where: {
                OR: [
                    { id: id },
                    { crimeNumber: id }
                ],
            },
            include: {
                properties: {
                    include: {
                        custodyLogs: true,
                        disposal: true
                    }
                },
                user: {
                    select: { firstname: true, lastname: true, rank: true }
                }
            }
        });

        console.log("Database result:", foundCase ? "Found" : "Not Found");

        if (!foundCase) return res.status(404).json({ error: "Case not found" });
        return res.json({ case: foundCase });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});

// 4. Log a Scan Event
router.post("/scan/:qrString", authMiddleware, async (req, res) => {
    try {
        const qrString = req.params.qrString as string; // Type assertion
        const userId = req.userId!;

        if (!qrString) return res.status(400).json({ error: "QR String is required" });

        const property = await prisma.property.findUnique({
            where: { qrString: qrString },
            include: { 
                case: true,
                custodyLogs: {
                    orderBy: {
                        movedAt: 'desc'
                    }
                }
            }
        });

        if (!property) return res.status(404).json({ error: "Invalid QR Code" });

        await prisma.scanLog.create({
            data: {
                userId: userId,
                propertyId: property.id,
            }
        });

        return res.json({ 
            message: "Scan logged successfully", 
            property 
        });
    } catch (err) {
        return res.status(500).json({ error: "Failed to log scan" });
    }
});

// 5. Update Property Data via QR String
router.put("/update-qr/:qrString", authMiddleware, async (req, res) => {
    try {
        const qrString = req.params.qrString as string; // Type assertion
        const userId = req.userId!;

        if (!qrString) {
            return res.status(400).json({ error: "QR String is required" });
        }

        const updatePropertySchema = z.object({
            category: z.enum(["ELECTRONICS", "WEAPON", "VEHICLE", "CASH", "NARCOTICS", "DOCUMENTS", "OTHER"]).optional(),
            belongingTo: z.enum(["ACCUSED", "COMPLAINANT", "VICTIM", "UNKNOWN"]).optional(),
            nature: z.enum(["RECOVERED", "SEIZED", "ABANDONED"]).optional(),
            quantity: z.number().int().positive().optional(),
            location: z.string().min(1).optional(),
            description: z.string().min(1).optional(),
            photoUrl: z.string().url().optional(),
        });

        const validation = updatePropertySchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ 
                error: "Invalid inputs", 
                details: validation.error.issues 
            });
        }

        const { category, belongingTo, nature, quantity, location, description, photoUrl } = validation.data;

        const updateData = Object.fromEntries(
            Object.entries({
                category,
                belongingTo,
                nature,
                quantity,
                location,
                description,
                photoUrl
            }).filter(([_, value]) => value !== undefined)
        );

        // Find the property and verify ownership
        const property = await prisma.property.findUnique({
            where: { qrString: qrString },
            include: { case: true }
        });

        if (!property) {
            return res.status(404).json({ error: "Property not found" });
        }

        // Verify that the user owns this case
        if (property.case.userId !== userId) {
            return res.status(403).json({ 
                error: "Unauthorized: You can only update properties from your own cases" 
            });
        }

        // Update the property
        const updatedProperty = await prisma.property.update({
            where: { qrString: qrString },
            data: updateData,
            include: {
                case: {
                    select: {
                        crimeNumber: true,
                        policeStation: true,
                        ioName: true
                    }
                }
            }
        });

        // Log the update action
        await prisma.scanLog.create({
            data: {
                userId: userId,
                propertyId: property.id,
            }
        });

        return res.json({ 
            message: "Property updated successfully", 
            property: updatedProperty 
        });

    } catch (err: any) {
        console.error("Update QR Error:", err);
        return res.status(500).json({ 
            error: "Failed to update property", 
            details: err.message 
        });
    }
});

// Analytics Stats
router.get("/analytics-stats", authMiddleware, async (req, res) => {
    try {
        const userId = req.userId!;

        const categoryStats = await prisma.property.groupBy({
            by: ['category'],
            where: {
                case: {
                    userId: userId
                }
            },
            _count: {
                _all: true
            }
        });

        const formattedStats = categoryStats.reduce((acc: any, curr) => {
            acc[curr.category] = curr._count._all;
            return acc;
        }, {});

        return res.json({ categories: formattedStats });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

// Validation Schema for Custody Movement
const custodyMovementSchema = z.object({
    toOfficer: z.string().min(1),
    purpose: z.string().min(1),
    remarks: z.string().optional(),
    newLocation: z.string().min(1),
});

// 6. Log Property Movement (Chain of Custody)
router.post("/property/:id/move", authMiddleware, async (req, res) => {
    try {
        const id = req.params.id as string; // Type assertion
        const userId = req.userId!;
        const { toOfficer, purpose, remarks, newLocation } = req.body;
        
        if (!id) {
            return res.status(400).json({ error: "Property ID is required" });
        }

        const property = await prisma.property.findUnique({
            where: { id: id },
            include: { 
                case: true,
                custodyLogs: { orderBy: { movedAt: 'desc' }, take: 1 }
            }
        });

        if (!property) return res.status(404).json({ error: "Property not found" });

        // Get the Logged in User's details
        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        const currentUserName = `${currentUser?.firstname} ${currentUser?.lastname}`.trim().toLowerCase();

        // Determine current possessor
        const currentPossessorName = (property.custodyLogs[0]?.toOfficer ?? property.case?.ioName ?? "")
                                     .trim().toLowerCase();

        // AUTHORIZATION CHECK
        const isOriginalCreator = property.case.userId === userId;
        const isCurrentHolder = currentUserName === currentPossessorName;

        if (!isCurrentHolder && !isOriginalCreator) {
            return res.status(403).json({ 
                error: `Access Denied. Current possessor is ${currentPossessorName}.` 
            });
        }

        const updatedLog = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const log = await tx.custodyLog.create({
                data: {
                    propertyId: id,
                    fromOfficer: property.custodyLogs[0]?.toOfficer ?? property.case.ioName,
                    toOfficer,
                    purpose,
                    remarks: remarks ?? null,
                    movedAt: new Date(),
                }
            });

            await tx.property.update({
                where: { id: id },
                data: { location: newLocation }
            });
            return log;
        });

        return res.json({ message: "Handover complete", log: updatedLog });
    } catch (err) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// Validation for Disposal
const disposalSchema = z.object({
    type: z.enum(["AUCTION", "DESTROYED", "RETURNED", "TRANSFERRED"]),
    courtOrderRef: z.string().min(1, "Court order reference is required"),
    dateOfDisposal: z.coerce.date(),
    remarks: z.string().optional(),
});

router.post("/property/:id/dispose", authMiddleware, async (req, res) => {
    try {
        const id = req.params.id as string; // Type assertion
        if (!id) {
            return res.status(400).json({ error: "Property ID is required" });
        }

        const parsed = disposalSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues });
        }

        const { type, courtOrderRef, dateOfDisposal, remarks } = parsed.data;

        const property = await prisma.property.findUnique({
            where: { id: id },
            select: {
                id: true,
                status: true,
                caseId: true,
            },
        });

        if (!property) {
            return res.status(404).json({ error: "Property not found" });
        }

        if (property.status === "DISPOSED") {
            return res.status(400).json({ error: "Property already disposed" });
        }

        const existingDisposal = await prisma.disposal.findUnique({
            where: { propertyId: id },
        });

        if (existingDisposal) {
            return res.status(400).json({ error: "Disposal already recorded" });
        }

        const disposal = await prisma.disposal.create({
            data: {
                propertyId: id,
                type,
                courtOrderRef,
                disposedAt: dateOfDisposal,
                remarks: remarks ?? null,
            },
        });

        await prisma.property.update({
            where: { id: id },
            data: {
                status: "DISPOSED",
            },
        });

        const remainingActive = await prisma.property.count({
            where: {
                caseId: property.caseId,
                status: "IN_CUSTODY",
            },
        });

        if (remainingActive === 0) {
            await prisma.caseRecord.update({
                where: { id: property.caseId },
                data: { status: "DISPOSED" },
            });
        }

        return res.json({
            message: "Disposal recorded successfully",
            disposal,
        });
    } catch (err) {
        console.error("DISPOSAL ERROR:", err);
        return res.status(500).json({
            error: "Failed to process disposal",
        });
    }
});

router.get("/properties/all", authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const properties = await prisma.property.findMany({
            where: {
                case: {
                    userId: userId
                }
            },
            include: {
                case: {
                    select: {
                        crimeNumber: true,
                        policeStation: true
                    }
                },
                disposal: true
            },
            orderBy: {
                status: 'asc' 
            }
        });

        return res.json({ properties });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch property registry" });
    }
});

router.get("/dashboard-stats", authMiddleware, async (req, res) => {
    try {
        const userId = req.userId!;

        const totalCases = await prisma.caseRecord.count({
            where: { userId }
        });

        const inCustodyCount = await prisma.property.count({
            where: {
                case: { userId },
                status: "IN_CUSTODY"
            }
        });

        const pendingDisposal = await prisma.property.count({
            where: {
                case: { userId },
                status: "DISPOSED"
            }
        });

        return res.json({
            totalCases,
            totalItems: inCustodyCount,
            pendingDisposal: pendingDisposal,
            stationId: "STN-" + userId.slice(0, 4).toUpperCase()
        });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});

// 7. Update Case Details
router.put("/update/:id", authMiddleware, async (req, res) => {
    try {
        const id = req.params.id as string; // Type assertion
        const userId = req.userId!;
        if (!id) return res.status(400).json({ error: "Case ID is required" });
        
        const caseRecord = await prisma.caseRecord.findUnique({
            where: { id: id }
        });

        if (!caseRecord) return res.status(404).json({ error: "Case not found" });

        if (caseRecord.userId !== userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user?.role !== "ADMIN") {
                return res.status(403).json({ error: "Unauthorized: You do not own this case record." });
            }
        }

        const { ioName, ioId, actLaw, sectionLaw, policeStation } = req.body;

        const updatedCase = await prisma.caseRecord.update({
            where: { id: id },
            data: { ioName, ioId, actLaw, sectionLaw, policeStation }
        });

        return res.json({ message: "Case updated successfully", case: updatedCase });
    } catch (err) {
        return res.status(500).json({ error: "Update failed" });
    }
});

// 8. Search All Accessible Cases
router.get("/search", authMiddleware, async (req, res) => {
    const q = req.query.q as string; // Type assertion
    const userId = req.userId!;
    if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    try {
        const cases = await prisma.caseRecord.findMany({
            where: {
                userId: userId,
                OR: [
                    { crimeNumber: { contains: q, mode: 'insensitive' } },
                    { ioName: { contains: q, mode: 'insensitive' } },
                ]
            },
            include: { _count: { select: { properties: true } } }
        });
        return res.json({ cases });
    } catch (err) {
        return res.status(500).json({ error: "Search failed" });
    }
});

export default router;