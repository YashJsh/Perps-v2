import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/token";

export const authMiddleware = (req : Request, res : Response, next : NextFunction)=>{
    const token = req.headers.authorization as string;
    if (!token){
        return res.status(401).json({
            success : false,
            error : "Token not found"
        });
    }
    const rawToken = token.split("Bearer ")[1];
    if (!rawToken){
        return res.status(401).json({
            success : false,
            error : "Invalid token recieved"
        });
    }
    const verify = verifyToken(rawToken);
    if (!verify){
        return res.status(403).json({
            success : false,
            error : "Not able to verify this token"
        });
    }
    req.id = verify.id;
    req.email = verify.email;
    next();
}