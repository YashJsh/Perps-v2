import { updateLanguageServiceSourceFile } from "typescript";
import { string } from "zod";
import jwt, { type JwtPayload } from "jsonwebtoken";

interface TokenPayload extends JwtPayload {
    id: string;
    email: string;
}

export const createToken = ({email, id}: {email : string, id : string})=>{
    const token = jwt.sign({email, id}, "JWTSECRETKEY");
    return token;
}

export const verifyToken = (token : string)=>{
    const verify = jwt.verify(token, "JWTSECRETKEY") as {
        email : string,
        id : string
    } ;
    return verify;
}

export const decodeToken = (token : string)=>{
    const decode = jwt.decode(token);
    return decode;
}