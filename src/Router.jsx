import React from "react";
import {
  Routes,
  Route,
} from "react-router-dom";

import AdbRouter from "./AdbRouter";
import Footer from "./features/navigation/Footer";
import Root from "./features/root/Root";
import OsdOverlay from "./features/osd-overlay/OsdOverlay";

export default function Router() {
  return(
    <>
      <Routes>
        <Route
          element={<Root />}
          path="/root"
        />

        <Route
          element={<OsdOverlay />}
          path="osd-overlay"
        />

        <Route
          element={<AdbRouter />}
          path="/*"
        />
      </Routes>

      <Footer />
    </>
  );
}
