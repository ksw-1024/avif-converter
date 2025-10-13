"""
GUIアプリケーション
"""
import customtkinter as ctk
from tkinter import filedialog
import threading
from typing import List

from config import *
from converter import AVIFConverter


class AVIFConverterApp(ctk.CTk):
    """AVIF Converterのメインアプリケーションウィンドウ"""
    
    def __init__(self):
        super().__init__()
        
        # 変換エンジン
        self.converter = AVIFConverter(quality=AVIF_QUALITY)
        
        # ウィンドウの基本設定
        self.title(WINDOW_TITLE)
        self.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.minsize(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
        
        # カラーテーマとアピアランスモードの設定
        ctk.set_appearance_mode(APPEARANCE_MODE)
        ctk.set_default_color_theme(COLOR_THEME)
        
        # 状態変数の初期化
        self.selected_files: List[str] = []
        self.output_folder: str = ""
        self.is_converting: bool = False
        
        # UIの構築
        self._create_widgets()
    
    def _create_widgets(self):
        """UIウィジェットの作成"""
        # メインフレーム
        self.main_frame = ctk.CTkFrame(self)
        self.main_frame.pack(fill="both", expand=True, padx=20, pady=20)
        
        # タイトルラベル
        self.title_label = ctk.CTkLabel(
            self.main_frame,
            text=APP_TITLE,
            font=ctk.CTkFont(size=TITLE_FONT_SIZE, weight="bold")
        )
        self.title_label.pack(pady=(10, 15))
        
        # 説明ラベル
        self.info_label = ctk.CTkLabel(
            self.main_frame,
            text="下のボタンから画像ファイルを選択してください",
            font=ctk.CTkFont(size=INFO_FONT_SIZE)
        )
        self.info_label.pack(pady=(5, 10))
        
        # ファイル選択ボタン
        self.select_files_button = ctk.CTkButton(
            self.main_frame,
            text="画像ファイルを選択",
            command=self._select_files,
            width=BUTTON_WIDTH,
            height=BUTTON_HEIGHT
        )
        self.select_files_button.pack(pady=8)
        
        # 保存先選択ボタン
        self.select_output_button = ctk.CTkButton(
            self.main_frame,
            text="保存先フォルダを選択",
            command=self._select_output_folder,
            width=BUTTON_WIDTH,
            height=BUTTON_HEIGHT
        )
        self.select_output_button.pack(pady=8)
        
        # 選択されたファイル数の表示
        self.file_count_label = ctk.CTkLabel(
            self.main_frame,
            text="選択されたファイル: 0",
            font=ctk.CTkFont(size=LABEL_FONT_SIZE)
        )
        self.file_count_label.pack(pady=8)
        
        # 保存先パスの表示
        self.output_path_label = ctk.CTkLabel(
            self.main_frame,
            text="保存先: 未設定",
            font=ctk.CTkFont(size=LABEL_FONT_SIZE)
        )
        self.output_path_label.pack(pady=3)
        
        # 変換ボタン
        self.convert_button = ctk.CTkButton(
            self.main_frame,
            text="AVIF形式に変換",
            command=self._start_conversion,
            width=BUTTON_WIDTH,
            height=BUTTON_HEIGHT,
            state="disabled"
        )
        self.convert_button.pack(pady=15)
        
        # プログレスバー
        self.progress_bar = ctk.CTkProgressBar(
            self.main_frame,
            width=PROGRESS_BAR_WIDTH
        )
        self.progress_bar.pack(pady=10)
        self.progress_bar.set(0)
        self.progress_bar.pack_forget()  # 初期状態では非表示
        
        # ステータスラベル
        self.status_label = ctk.CTkLabel(
            self.main_frame,
            text="",
            font=ctk.CTkFont(size=LABEL_FONT_SIZE)
        )
        self.status_label.pack(pady=10)
    
    def _select_files(self):
        """画像ファイルの選択"""
        files = filedialog.askopenfilenames(
            title="変換する画像を選択",
            filetypes=FILE_DIALOG_FILETYPES
        )
        
        if files:
            self.selected_files = list(files)
            
            if DEBUG_MODE:
                print(f"[GUI] 選択されたファイル数: {len(self.selected_files)}")
            
            self.file_count_label.configure(
                text=f"選択されたファイル: {len(self.selected_files)}"
            )
            self.status_label.configure(
                text=f"{len(self.selected_files)}個のファイルを選択しました",
                text_color="green"
            )
            self._update_convert_button_state()
    
    def _select_output_folder(self):
        """保存先フォルダの選択"""
        folder = filedialog.askdirectory(title="保存先フォルダを選択")
        
        if folder:
            self.output_folder = folder
            
            if DEBUG_MODE:
                print(f"[GUI] 保存先フォルダ: {self.output_folder}")
            
            # パスが長い場合は省略表示
            display_path = folder if len(folder) < 50 else "..." + folder[-47:]
            self.output_path_label.configure(
                text=f"保存先: {display_path}"
            )
            self.status_label.configure(
                text="保存先を設定しました",
                text_color="green"
            )
            self._update_convert_button_state()
    
    def _update_convert_button_state(self):
        """変換ボタンの有効/無効を更新"""
        has_files = bool(self.selected_files)
        has_output = bool(self.output_folder)
        
        if DEBUG_MODE:
            print(f"[GUI] ファイル有: {has_files}, 保存先有: {has_output}")
        
        if has_files and has_output:
            self.convert_button.configure(state="normal")
        else:
            self.convert_button.configure(state="disabled")
    
    def _start_conversion(self):
        """変換を開始（スレッドで実行）"""
        if self.is_converting:
            self.status_label.configure(
                text="既に変換処理が実行中です",
                text_color="orange"
            )
            return
        
        # 事前チェック
        if not self.selected_files:
            self.status_label.configure(
                text="エラー: ファイルが選択されていません",
                text_color="red"
            )
            return
        
        if not self.output_folder:
            self.status_label.configure(
                text="エラー: 保存先フォルダが選択されていません",
                text_color="red"
            )
            return
        
        if DEBUG_MODE:
            print(f"[GUI] 変換処理を開始: {len(self.selected_files)}ファイル")
        
        self.is_converting = True
        self.convert_button.configure(state="disabled", text="変換中...")
        self.progress_bar.pack(pady=10)
        self.progress_bar.set(0)
        self.status_label.configure(
            text="変換を開始します...",
            text_color="blue"
        )
        
        # 別スレッドで変換実行
        thread = threading.Thread(target=self._convert_images, daemon=True)
        thread.start()
    
    def _convert_images(self):
        """画像をAVIF形式に変換（スレッド内で実行）"""
        def progress_callback(current: int, total: int, filename: str):
            """進行状況のコールバック"""
            progress = current / total
            self.after(0, self._update_progress, progress, current, total)
        
        def error_callback(filename: str, error_message: str):
            """エラーのコールバック"""
            error_msg = f"エラー: {filename} - {error_message}"
            self.after(0, lambda: self.status_label.configure(
                text=error_msg,
                text_color="red"
            ))
        
        # 変換実行
        success_count, error_count = self.converter.convert_batch(
            self.selected_files,
            self.output_folder,
            progress_callback=progress_callback,
            error_callback=error_callback
        )
        
        # 完了処理
        self.after(0, self._conversion_complete, success_count, error_count)
    
    def _update_progress(self, progress: float, current: int, total: int):
        """進行状況を更新（メインスレッドで実行）"""
        self.progress_bar.set(progress)
        self.status_label.configure(
            text=f"変換中... {current}/{total}",
            text_color="blue"
        )
    
    def _conversion_complete(self, success_count: int, error_count: int):
        """変換完了処理（メインスレッドで実行）"""
        self.is_converting = False
        self.convert_button.configure(state="normal", text="AVIF形式に変換")
        self.progress_bar.set(1.0)
        
        # 完了メッセージ
        if error_count == 0:
            self.status_label.configure(
                text=f"変換完了！ {success_count}個のファイルを変換しました",
                text_color="green"
            )
        else:
            self.status_label.configure(
                text=f"変換完了: 成功 {success_count}個, 失敗 {error_count}個",
                text_color="orange"
            )
        
        if DEBUG_MODE:
            print(f"[GUI] 変換完了: 成功={success_count}, 失敗={error_count}")
