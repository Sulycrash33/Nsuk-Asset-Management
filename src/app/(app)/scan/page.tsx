import ScanClient from "./scan-client";

export const metadata = { title: "Scan" };

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Scan an asset</h1>
        <p className="text-sm text-nsuk-muted">
          Point the camera at the barcode or QR code on the label. A handheld scanner may also be
          used, and will enter the code in the field below.
        </p>
      </header>
      <ScanClient />
    </div>
  );
}
