// O jogo inteiro é a página web em ../dist; o Tauri só abre uma janela nativa com ela.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Gwent Clássico");
}
