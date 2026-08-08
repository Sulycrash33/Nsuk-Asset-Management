import ScanClient from "./scan-client";

export const metadata = { title: "Scan · NSUK Asset Register" };

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Scan an asset</h1>
        <p className="text-sm text-neutral-600">
          Point the camera at the label’s barcode or QR code. A handheld scanner also works — it
          types the code into the box below.
        </p>
      </header>
      <ScanClient />
    </div>
  );
}
