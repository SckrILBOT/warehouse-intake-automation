import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,bytes){const name=Buffer.from(type);const size=Buffer.alloc(4);size.writeUInt32BE(bytes.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([name,bytes])));return Buffer.concat([size,name,bytes,crc]);}
const lines=[[40,58,96,30],[96,30,152,58],[152,58,152,134],[152,134,96,162],[96,162,40,134],[40,134,40,58],[40,58,96,86],[96,86,152,58],[96,86,96,162],[60,108,82,130],[82,130,131,76]];
function distance(x,y,[a,b,c,d]){const dx=c-a,dy=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a-t*dx,y-b-t*dy);}
for(const size of [180,192,512]){
 const pixels=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){pixels[y*(size*4+1)]=0;for(let x=0;x<size;x++){const u=(x+.5)*192/size,v=(y+.5)*192/size;const edge=Math.min(...lines.map(line=>distance(u,v,line)));const white=Math.max(0,Math.min(1,(4-edge)*size/192));const i=y*(size*4+1)+1+x*4;pixels[i]=Math.round(34+(255-34)*white);pixels[i+1]=Math.round(104+(255-104)*white);pixels[i+2]=Math.round(91+(255-91)*white);pixels[i+3]=255;}}
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 writeFileSync(`public/icon-${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
