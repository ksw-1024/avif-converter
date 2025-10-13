"""
AVIF Converter - エントリーポイント

画像ファイルをAVIF形式に変換するGUIアプリケーション
"""
from gui import AVIFConverterApp


def main():
    """アプリケーションのメインエントリーポイント"""
    app = AVIFConverterApp()
    app.mainloop()


if __name__ == "__main__":
    main()
