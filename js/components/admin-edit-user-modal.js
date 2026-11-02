import { TX } from "/js/strings/screens/admin_edit_user.js";
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
              <h5 class="modal-title mb-0">${TX.editarUsuario}</h5>
              <small class="text-muted">${TX.actualizaRolPermisosBase}</small>
            </div>

            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="${TX.cerrar}"
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
                            ${TX.datosDelUsuario}
                          </h6>
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editEmail" class="form-label">${TX.email}</label>
                          <input
                            type="email"
                            id="editEmail"
                            class="form-control"
                            disabled
                            autocomplete="off"
                          />
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editSystemRole" class="form-label">${TX.rol}</label>
                          <select id="editSystemRole" class="form-select"></select>
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editAssociationStatus" class="form-label">
                            ${TX.estadoDeAsociacion}
                          </label>
                          <select id="editAssociationStatus" class="form-select">
                            <option value="">${TX.ninguno}</option>
                            <option value="active">${TX.activa}</option>
                            <option value="inactive">${TX.inactiva}</option>
                          </select>
                        </div>

                        <div class="col-12 col-md-6">
                          <div class="card border bg-white h-100">
                            <div class="card-body">
                              <h6 class="mb-3">${TX.permisosRapidos}</h6>

                              <div class="form-check mb-3">
                                <input
                                  class="form-check-input"
                                  type="checkbox"
                                  id="editCanUsePickups"
                                />
                                <label class="form-check-label" for="editCanUsePickups">
                                  ${TX.puedeUsarPickups}
                                </label>
                              </div>

                              <div class="form-check">
                                <input
                                  class="form-check-input"
                                  type="checkbox"
                                  id="editIsPlayerActive"
                                />
                                <label class="form-check-label" for="editIsPlayerActive">
                                  ${TX.playerActivo}
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
                            ${TX.vincularConPlayer}
                          </h6>
                        </div>

                        <div class="col-12 col-md-6">
                          <label for="editPlayerMode" class="form-label">${TX.modo}</label>
                          <select id="editPlayerMode" class="form-select">
                            <option value="none">${TX.sinPlayer}</option>
                            <option value="existing">${TX.ligarAPlayerExistente}</option>
                            <option value="new">${TX.crearPlayerNuevo}</option>
                          </select>
                        </div>

                        <div class="col-12 d-none" id="editExistingPlayerWrap">
                          <label for="editExistingPlayerId" class="form-label">
                            ${TX.playerExistente}
                          </label>
                          <select id="editExistingPlayerId" class="form-select">
                            <option value="">${TX.seleccionar}</option>
                          </select>
                        </div>

                        <div class="col-12 d-none" id="editNewPlayerWrap">
                          <div class="card border bg-white">
                            <div class="card-body">
                              <div class="row g-3">
                                <div class="col-12">
                                  <h6 class="mb-1">${TX.nuevoPlayer}</h6>
                                  <p class="text-muted small mb-0">
                                    ${TX.seCreaUnRegistro}
                                  </p>
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerFirstName" class="form-label">
                                    ${TX.nombre}
                                  </label>
                                  <input
                                    type="text"
                                    id="editNewPlayerFirstName"
                                    class="form-control"
                                  />
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerLastName" class="form-label">
                                    ${TX.apellido}
                                  </label>
                                  <input
                                    type="text"
                                    id="editNewPlayerLastName"
                                    class="form-control"
                                  />
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerBirthday" class="form-label">
                                    ${TX.fechaDeNacimiento}
                                  </label>
                                  <input
                                    type="date"
                                    id="editNewPlayerBirthday"
                                    class="form-control"
                                  />
                                </div>

                                <div class="col-12 col-md-6">
                                  <label for="editNewPlayerFieldRole" class="form-label">
                                    ${TX.posicionRolDeCancha}
                                  </label>
                                  <select id="editNewPlayerFieldRole" class="form-select"></select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="col-12">
                          <div class="alert alert-secondary mb-0">
                            <strong>${TX.nota}</strong> ${TX.siCambiasElVinculo}
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
              ${TX.cancelar}
            </button>

            <button type="submit" class="btn btn-primary">
              ${TX.guardarCambios}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper.firstElementChild);
}