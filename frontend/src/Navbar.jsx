import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function Navbar({ setPhase, resetBatch, compressing = false }) {
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem('darkMode', darkMode);

        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    const handleBrandClick = () => {
        if (compressing) {
            toast.warning("Compression in progress — please wait before navigating away.");
            return;
        }
        if (resetBatch) {
            resetBatch();
        } else {
            setPhase('landing');
        }
    };

    return (
        <nav className="text-lg sm:text-xl font-bold flex justify-between items-center px-4 py-2.5 sm:py-3 border-b border-border select-none transition-all safe-top shrink-0">
            <h1 className="cursor-pointer active:opacity-75 transition-opacity" onClick={handleBrandClick}>
                xBit<span className="text-blue-500">Compressor</span>
            </h1>
            <button
                onClick={() => setDarkMode(prev => !prev)}
                aria-label="Toggle dark mode"
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
            >
                {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>
        </nav>
    );
}

export default Navbar;
