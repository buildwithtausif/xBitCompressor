import { ImageUp } from "lucide-react";
import { toast } from "sonner";

function LandingPage({setImage, setPhase}){
    const supportedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    const dropHandler = (e) => {
        e.preventDefault();
        if (!e.dataTransfer.files[0].type.startsWith("image/")) {
            return toast.error("Provide an image");
        }
        if (!supportedFormats.includes(e.dataTransfer.files[0].type)){
            return toast.error("Currently supported formats are: PNG, JPG/JPEG and WEBP");
        }
        
        setImage(e.dataTransfer.files[0]);
        setPhase('settings');
    };
    return(
        <div className="h-full w-full flex flex-col items-center text-center gap-4">
            <p className="mt-10 text-3xl font-bold">Image <span className="text-blue-500">Compressor</span></p>
            <p className="opacity-70 font-medium">An image compressor based on PyVips</p>
            <p className="opacity-70 font-medium mb-4">Currently supported formats: <span className="text-blue-500">PNG, JPG/JPEG, WEBP</span></p>
            <label
                htmlFor="imageFile"
                id="dropBox"
                className="w-9/10 h-6/10 border-3 border-dashed border-border opacity-45 flex flex-col items-center justify-center gap-4 px-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropHandler}
            >
                <ImageUp className="size-20" />
                <p>Drag & Drop or Choose Image by clicking here</p>
                <input
                hidden
                id="imageFile"
                type="file"
                accept={supportedFormats.join(", ")}
                onChange={(e) => {
                    setImage(e.target.files[0]);
                    setPhase('settings');
                }}
                />
            </label>
        </div>        
    )
}
export default LandingPage;