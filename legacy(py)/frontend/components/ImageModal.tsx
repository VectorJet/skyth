"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { X, ZoomIn, Download } from "lucide-react";
import { Button } from "./ui/button";

export default function ImageModal({ src, alt }: { src: string; alt: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const downloadImage = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `skyth-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="relative group cursor-pointer overflow-hidden rounded-xl">
          <img 
            src={src} 
            alt={alt} 
            className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105" 
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 backdrop-blur-sm">
              <ZoomIn className="w-3 h-3" /> View
            </div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center">
        <div className="relative w-full h-full flex flex-col items-center">
          <div className="relative rounded-lg overflow-hidden shadow-2xl">
            <img src={src} alt={alt} className="max-w-[85vw] max-h-[80vh] object-contain" />
          </div>
          
          <div className="flex gap-2 mt-4">
            <Button onClick={downloadImage} variant="secondary" className="rounded-full gap-2">
              <Download className="w-4 h-4" /> Download
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" className="rounded-full w-10 h-10 p-0">
                <X className="w-5 h-5" />
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}