"""
アプリケーション設定と定数
"""

# ウィンドウ設定
WINDOW_TITLE = "AVIF Converter"
WINDOW_WIDTH = 650
WINDOW_HEIGHT = 550
WINDOW_MIN_WIDTH = 600
WINDOW_MIN_HEIGHT = 500

# UI設定
APP_TITLE = "AVIF Image Converter"
TITLE_FONT_SIZE = 24
INFO_FONT_SIZE = 14
LABEL_FONT_SIZE = 12

BUTTON_WIDTH = 200
BUTTON_HEIGHT = 40

PROGRESS_BAR_WIDTH = 400

# カラーテーマ
APPEARANCE_MODE = "system"
COLOR_THEME = "blue"

# 変換設定
AVIF_QUALITY = 85
SUPPORTED_FORMATS = ('.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.tif', '.webp')

# ファイルダイアログ設定
FILE_DIALOG_FILETYPES = [
    ("画像ファイル", "*.jpg *.jpeg *.png *.bmp *.gif *.tiff *.webp"),
    ("すべてのファイル", "*.*")
]

# デバッグ設定
DEBUG_MODE = True  # Falseに設定するとデバッグメッセージを無効化
