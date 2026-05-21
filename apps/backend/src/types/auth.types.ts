import * as z from "zod";

const authSchema = z.object({
    email : z.email(),
    username : z.string().min(1, "Min length is 1"),
    password : z.string().min(1, "Min password length is 1")
})

export { authSchema }