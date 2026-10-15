import { useId, useState } from "react";
import { downloadFinancialEvidence, uploadFinancialEvidence } from "../operations.api";
import type { FinancialEvidence } from "../operations.types";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

type PrivateEvidenceUploadProps = {
    label: string;
    evidence: FinancialEvidence | null;
    onChange: (evidence: FinancialEvidence | null) => void;
};

const PrivateEvidenceUpload = ({ label, evidence, onChange }: PrivateEvidenceUploadProps) => {
    const inputId = useId();
    const helpId = `${inputId}-help`;
    const errorId = `${inputId}-error`;
    const [error, setError] = useState("");
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const upload = async (file?: File) => {
        setError("");
        if (!file) return;
        if (!ACCEPTED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) {
            onChange(null);
            setError("Choose a PNG, JPEG, or PDF no larger than 2 MiB.");
            return;
        }
        onChange(null);
        setUploading(true);
        try {
            onChange(await uploadFinancialEvidence(file));
        } catch {
            setError("Evidence could not be uploaded. Check your admin session and try again.");
        } finally {
            setUploading(false);
        }
    };

    const download = async () => {
        if (!evidence || downloading) return;
        setDownloading(true);
        setError("");
        let objectUrl = "";
        try {
            const blob = await downloadFinancialEvidence(evidence.id);
            objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = evidence.originalFilename || `evidence-${evidence.id}`;
            anchor.hidden = true;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } catch {
            setError("Private evidence is unavailable to this admin session. Upload it again if needed.");
        } finally {
            if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
            setDownloading(false);
        }
    };

    return <div className="operations__evidence">
        <label htmlFor={inputId}>{label}</label>
        <input id={inputId} name="evidence" type="file" accept="image/png,image/jpeg,application/pdf" onChange={(event) => void upload(event.currentTarget.files?.[0])} disabled={uploading} aria-describedby={`${helpId} ${errorId}`} />
        <small id={helpId}>PNG, JPEG, or PDF · maximum 2 MiB · private admin access</small>
        {uploading ? <span role="status" aria-live="polite">Uploading evidence…</span> : null}
        {evidence ? <div className="operations__evidence-file"><span>{evidence.originalFilename}</span><button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => void download()} disabled={downloading}>{downloading ? "Opening…" : "Download private file"}</button></div> : null}
        {error ? <p id={errorId} className="operations__field-error" role="alert">{error}</p> : <span id={errorId} className="operations__sr-only" />}
    </div>;
};

export default PrivateEvidenceUpload;
