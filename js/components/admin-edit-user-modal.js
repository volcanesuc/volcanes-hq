export async function loadAdminEditUserModal() {
  if (document.getElementById("editUserModal")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div
      class="modal fade"
      id="editUserModal"
      tabindex="-1"
      aria-hidden="true"
    >
      <div class="modal-dialog modal-fullscreen">
        <form class="modal-content border-0 rounded-0" id="editUserForm">
          <div class="modal-header">
            <div class="d-flex flex-column">
              <h5 class="modal-title mb-0">Editar usuario</h5>
              <small class="text-muted">Actualiza rol y permisos base del usuario</small>
            </div>

            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Cerrar"
            ></button>
          </div>

          <div class="modal-body bg-light">
            <div class="container-fluid py-3 py-md-4">
              <div class="row justify-content-center">
                <div class="col-12 col-xl-10 col-xxl-8">
                  <div class="card shadow-sm border-0">
                    <div class="card-body p-4 p-lg-5">
                      <input type="hidden" id="editUid" />

                      <div class="row g-4">
                        <div class="col-12">
                          <h6 class="text-uppercase text-muted small mb-0">
                            Datos del usuario
                          </h6>
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editEmail" class="form-label">Email</label>
                          <input
                            type="email"
                            id="editEmail"
                            class="form-control"
                            disabled
                            autocomplete="off"
                          />
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editSystemRole" class="form-label">Rol</label>
                          <select id="editSystemRole" class="form-select"></select>
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editAssociationStatus" class="form-label">
                            Estado de asociación
                          </label>
                          <select id="editAssociationStatus" class="form-select">
                            <option value="">Ninguno</option>
                            <option value="active">Activa</option>
                            <option value="inactive">Inactiva</option>
                          </select>
                        </div>

                        <div class="col-12 col-md-6">
                          <div class="card border bg-white h-100">
                            <div class="card-body">
                              <h6 class="mb-3">Permisos rápidos</h6>

                              <div class="form-check mb-3">
                                <input
                                  class="form-check-input"
                                  type="checkbox"
                                  id="editCanUsePickups"
                                />
                                <label class="form-check-label" for="editCanUsePickups">
                                  Puede usar pickups
                                </label>
                              </div>

                              <div class="form-check">
                                <input
                                  class="form-check-input"
                                  type="checkbox"
                                  id="editIsPlayerActive"
                                />
                                <label class="form-check-label" for="editIsPlayerActive">
                                  Player activo
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="col-12">
                          <div class="alert alert-secondary mb-0">
                            <strong>Nota:</strong> este modal actualiza el documento del usuario.
                            Más adelante podemos extenderlo para edición avanzada, auditoría y permisos por sección.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-outline-secondary"
              data-bs-dismiss="modal"
            >
              Cancelar
            </button>

            <button type="submit" class="btn btn-primary">
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper.firstElementChild);
}