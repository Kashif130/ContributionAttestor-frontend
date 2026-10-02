import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastViewport } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Claim } from "./pages/Claim";
import { Profile } from "./pages/Profile";
import { Registry } from "./pages/Registry";
import { Keepers } from "./pages/Keepers";
import { Admin } from "./pages/Admin";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/registry" element={<Registry />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:address" element={<Profile />} />
          <Route path="/keepers" element={<Keepers />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
