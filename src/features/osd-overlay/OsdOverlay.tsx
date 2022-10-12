import React from "react";

import Container from "@mui/material/Container";
import Header from "../navigation/Header";

export default function OsdOverlay() {
  return (
    <Container fixed sx={{ paddingBottom: 3 }}>
      <Header />
    </Container>
  );
}
