// /js/components/gallery_upload.js
// Modal para que un usuario con cuenta suba fotos a la galería del landing (quedan pendientes).
import { LX, lxf } from "/js/strings/screens/landing.js";
import { MAX_PHOTO_MB, listMyPhotos, uploadGalleryPhoto } from "/js/features/landing/landing_data.js";

let modal = null;
let onDoneCb = null;

function ensureModal() {
  if (modal) return modal;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal fade" id="galleryUploadModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form id="galleryUploadForm" novalidate>
            <div class="modal-header">
              <div>
                <h5 class="modal-title mb-0" id="galleryUploadTitle"></h5>
                <small class="text-muted" id="galleryUploadHint"></small>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input class="form-control" type="file" id="galleryFiles" accept="image/*" multiple required />
              <div class="d-flex flex-wrap gap-1 mt-2" id="galleryPreview"></div>
              <label class="form-label small mt-3" for="galleryCaption" id="galleryCaptionLabel"></label>
              <input class="form-control" id="galleryCaption" maxlength="140" />
              <div class="small mt-2" id="galleryUploadStatus"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="galleryCancelBtn"></button>
              <button type="submit" class="btn btn-primary" id="gallerySendBtn"></button>
            </div>
          </form>
        </div>
      </div>
    </div>`);

  const $ = (id) => document.getElementById(id);
  $("galleryUploadTitle").textContent = LX.galleryUploadTitle;
  $("galleryUploadHint").textContent = lxf(LX.galleryUploadHint, { mb: MAX_PHOTO_MB });
  $("galleryCaptionLabel").textContent = LX.galleryCaption;
  $("galleryCancelBtn").textContent = LX.cancel;
  $("gallerySendBtn").textContent = LX.send;

  $("galleryFiles").onchange = () => {
    const files = [...$("galleryFiles").files].slice(0, 10);
    $("galleryPreview").innerHTML = files
      .map((f) => `<img src="${URL.createObjectURL(f)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;" />`)
      .join("");
  };

  $("galleryUploadForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const files = [...$("galleryFiles").files].slice(0, 10);
    if (!files.length) return;
    const status = $("galleryUploadStatus");
    const sendBtn = $("gallerySendBtn");
    sendBtn.disabled = true;
    const errors = [];
    for (const [i, file] of files.entries()) {
      status.className = "small mt-2";
      status.textContent = lxf(LX.galleryUploading, { n: i + 1, total: files.length });
      try {
        await uploadGalleryPhoto(file, { caption: $("galleryCaption").value.trim() });
      } catch (err) {
        const reason = err?.message === "too-big"
          ? lxf(LX.galleryErrorTooBig, { mb: MAX_PHOTO_MB })
          : err?.message === "not-image" ? LX.galleryErrorNotImage : (err?.code || err?.message || "");
        errors.push(`${file.name}: ${reason}`);
      }
    }
    sendBtn.disabled = false;
    if (errors.length) {
      status.className = "small mt-2 text-danger";
      status.textContent = lxf(LX.galleryUploadError, { error: errors.join(" · ") });
    } else {
      status.className = "small mt-2 text-success";
      status.textContent = LX.galleryUploaded;
      setTimeout(() => modal.hide(), 1400);
    }
    onDoneCb?.();
  };

  modal = new bootstrap.Modal($("galleryUploadModal"));
  return modal;
}

export function openGalleryUpload({ onDone } = {}) {
  ensureModal();
  onDoneCb = onDone || null;
  const $ = (id) => document.getElementById(id);
  $("galleryUploadForm").reset();
  $("galleryPreview").innerHTML = "";
  $("galleryUploadStatus").textContent = "";
  modal.show();
}

export async function countMyPendingPhotos(uid) {
  if (!uid) return 0;
  const mine = await listMyPhotos(uid).catch(() => []);
  return mine.filter((p) => p.status === "pending").length;
}
