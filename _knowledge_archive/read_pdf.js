const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('Buku-panduan-AI-BAHASA-INDONESIA_compressed.pdf');

pdf(dataBuffer).then(function(data) {
    // number of pages
    console.log("Pages:", data.numpages);
    // info
    console.log("Info:", data.info);
    // text
    console.log("TEXT START==================\n");
    console.log(data.text.substring(0, 3000)); // Only first 3000 chars to avoid huge console output
    console.log("\nTEXT END==================");
}).catch(function(error){
    console.error("Error reading PDF:", error);
});
