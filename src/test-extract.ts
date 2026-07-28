// Just a dummy file to check types
import * as pdfjsLib from 'pdfjs-dist';
async function test() {
   const page = await pdfjsLib.getDocument({data: []}).promise.then(p => p.getPage(1));
   const ops = await page.getOperatorList();
   const img = await page.objs.get(ops.argsArray[0][0]);
}
