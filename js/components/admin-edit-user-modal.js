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
              <small class="text-muted">Actualiza rol, permisos base y vínculo con player</small>
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

                        <div class="col-12 mt-2">
                          <hr />
                        </div>

                        <div class="col-12">
                          <h6 class="text-uppercase text-muted small mb-0">
                            Vincular con player
                          </h6>
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editPlayerMode" class="form-label">Modo</label>
                          <select id="editPlayerMode" class="form-select">
                            <option value="none">Sin player</option>
                            <option value="existing">Ligar a player existente</option>
                            <option value="new">Crear player nuevo</option>
                          </select>
                        </div>

                        <div class="col-12 d-none" id="editExistingPlayerWrap">
                          <label for="editExistingPlayerId" class="form-label">
                            Player existente
                          </label>
                          <select id="editExistingPlayerId" class="form-select">
                            <option value="">Seleccionar…</option>
                          </select>
                        </div>

                        <div class="col-12 d-none" id="editNewPlayerWrap">
                          <div class="card border bg-white">
                            <div class="card-body">
                              <div class="row g-3">
                                <div class="col-12">
                                  <h6 class="mb-1">Nuevo player</h6>
                                  <p class="text-muted small mb-0">
                                    Se crea un registro nuevo en club_players y se liga a este usuario.
                                  </p>
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerFirstName" class="form-label">
                                    Nombre
                                  </label>
                                  <input
                                    type="text"
                                    id="editNewPlayerFirstName"
                                    class="form-control"
                                  />
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerLastName" class="form-label">
                                    Apellido
                                  </label>
                                  <input
                                    type="text"
                                    id="editNewPlayerLastName"
                                    class="form-control"
                                  />
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerBirthday" class="form-label">
                                    Fecha de nacimiento
                                  </label>
                                  <input
                                    type="date"
                                    id="editNewPlayerBirthday"
                                    class="form-control"
                                  />
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerFieldRole" class="form-label">
                                    Posición / rol de cancha
                                  </label>
                                  <select id="editNewPlayerFieldRole" class="form-select"></select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="col-12">
                          <div class="alert alert-secondary mb-0">
                            <strong>Nota:</strong> si cambias el vínculo, este modal actualiza tanto
                            <code>users/{uid}</code> como <code>club_players/{playerId}</code>.
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