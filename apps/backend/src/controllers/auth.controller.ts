import type { Request, Response} from "express";
import { authSchema } from "../types/auth.types";
import { prisma } from "db";
import { checkPassword, encryptPassword } from "../utils/password";
import { createToken } from "../utils/token";
import { onRampSchema } from "../types/exchange.types";

export const signUpController = async (req: Request, res: Response) => {
    try {
        const parsed_body = authSchema.parse(req.body);
        if (!parsed_body) {
            console.log("Error in body");
            return;
        }
        const { email, username, password } = parsed_body;

        const user = await prisma.user.findUnique({
            where: {
                email: email
            }
        })

        if (user) {
            res.status(409).json({
                error: "User already exists"
            })
            return;
        };

        const password_hash = await encryptPassword(parsed_body.password);
        
        const new_user = await prisma.user.create({
            data : {
                email,
                password : password_hash,
                username
            }
        });

        res.status(201).json({
            success : true,
            message : "User signed up successfully"
        })
        return;
    } catch (error) {
        res.status(500).json({
            success : false,
            message : "Internal Server Error"
        });
    }
}

export const signInController = async (req : Request, res : Response)=>{
    try {
        const body = req.body;
        const parsed_body = authSchema.parse(body);
        if (!parsed_body){
            throw new Error("Invalid Body")
        };
        const user = await prisma.user.findUnique({
            where: {
                email: parsed_body.email
            }
        })
        if (!user){
            res.status(404).json({
                success : false,
                error : "User not found"
            })
            return;
        };

        const check = await checkPassword(parsed_body.password, user.password);
        if (!check){
            res.status(403).json({
                success : false,
                error : "Password doesn't match"
            });
        }

        const token = createToken({email : user.email, id : user.id});
        res.status(200).json({
            success : true,
            token : token
        });
    } catch (error) {
         res.status(500).json({
            success : false,
            error : error
        });
    }
}

export const onRamp = async (req : Request, res : Response)=>{
    const body = req.body;
    const user_id  = req.id;
    if (!user_id){
        throw new Error("Not Authorized to access this route");
    }
    const parsed_body = onRampSchema.parse(body);
    if (!parsed_body){
        throw new Error("Invalid On ramp data");
    };

    //Sending request to engine
    //Waiting for the engine to resposnd back
    
}