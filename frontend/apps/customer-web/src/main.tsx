import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DangXayLai } from "../../../src/DangXayLai";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<DangXayLai ten="Mây · Khách" />
	</StrictMode>,
);
