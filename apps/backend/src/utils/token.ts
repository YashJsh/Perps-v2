import { updateLanguageServiceSourceFile } from "typescript";
import { string } from "zod";
import jwt from "jsonwebtoken";

export const createToken = ({email, id}: {email : string, id : string})=>{
    const token = jwt.sign({email, id}, "JWTSECRETKEY");
    return token;
}

export const verifyToken = (token : string)=>{
    const verify = jwt.verify(token, "JWTSECRETKEY");
    return verify;
}