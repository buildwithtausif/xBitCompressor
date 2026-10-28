import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";


function Navbar({ setPhase }) {
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('darkMode') === 'true';
    });

    useEffect(() => {
        localStorage.setItem('darkMode', darkMode);

        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    return (
        <nav className="text-xl font-bold flex justify-between p-2 border-b border-border select-none transition-all">
            <h1 className="cursor-pointer" onClick={() => setPhase('landing')}>xBit<span className="text-blue-500">Compressor</span></h1>
            <button onClick={() => setDarkMode(prev => !prev)}>
                {darkMode ? <Sun /> : <Moon />}
            </button>
        </nav>
    );
}

export default Navbar;