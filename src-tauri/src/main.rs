// Sem janela de terminal no Windows na versão final.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gwent_classico_lib::run()
}
