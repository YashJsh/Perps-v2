import bcrypt from "bcrypt"

const encryptPassword = async (password : string)=>{
    const hash = bcrypt.hash(password, 10);
    return hash;
} 

const checkPassword = async (password : string, stored_password : string)=>{
    const check = bcrypt.compare(password, stored_password);
    return check;
}

export { encryptPassword, checkPassword } 