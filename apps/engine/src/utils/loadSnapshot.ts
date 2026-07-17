import path from "path";
import fs from "fs";

export const LoadSnapShot = ()=>{
    const snapShotDir = path.resolve(__dirname, "../../../snapshots");
    if (!fs.existsSync(snapShotDir)){
        return null;
    }

    const files = fs.readdirSync(snapShotDir);

    if (files.length == 0) return null;

    const latestFile = files.map(f => {
        const filePath = path.join(snapShotDir, f);
        return {
            name : f,
            time : fs.statSync(filePath).mtime.getTime(),
            path : filePath
        };
    }).sort((a, b) => b.time - a.time)[0];

    if (!latestFile){
        return null;
    }

    console.log(`LOADING SNAPSHOT : ${latestFile.name}`);

    const data = JSON.parse(fs.readFileSync(latestFile.path, "utf-8"));
    return data;
}