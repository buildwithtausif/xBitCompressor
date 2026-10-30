import { Loader2 } from "lucide-react";

function Spinner({ className = "size-4" }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export default Spinner;

