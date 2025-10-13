"""
AVIF画像変換ロジック
"""
import os
from PIL import Image
import pillow_avif
from typing import List, Tuple, Callable, Optional
from config import AVIF_QUALITY, DEBUG_MODE


class AVIFConverter:
    """AVIF形式への画像変換を処理するクラス"""
    
    def __init__(self, quality: int = AVIF_QUALITY):
        """
        Args:
            quality: AVIF変換時の品質設定 (0-100)
        """
        self.quality = quality
    
    def convert_single_image(self, input_path: str, output_path: str) -> None:
        """
        単一の画像をAVIF形式に変換
        
        Args:
            input_path: 入力画像のパス
            output_path: 出力先のパス
            
        Raises:
            Exception: 変換中にエラーが発生した場合
        """
        with Image.open(input_path) as img:
            # カラーモードの変換
            if img.mode in ('RGBA', 'LA', 'P'):
                # 透明度を持つ画像
                if img.mode == 'P':
                    img = img.convert('RGBA')
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # AVIF形式で保存
            img.save(output_path, 'AVIF', quality=self.quality)
    
    def convert_batch(
        self,
        input_files: List[str],
        output_folder: str,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        error_callback: Optional[Callable[[str, str], None]] = None
    ) -> Tuple[int, int]:
        """
        複数の画像を一括でAVIF形式に変換
        
        Args:
            input_files: 入力画像のパスリスト
            output_folder: 出力先フォルダ
            progress_callback: 進行状況を通知するコールバック (current, total, filename)
            error_callback: エラー発生時のコールバック (filename, error_message)
            
        Returns:
            (成功数, 失敗数) のタプル
        """
        total = len(input_files)
        success_count = 0
        error_count = 0
        
        for i, input_path in enumerate(input_files, 1):
            try:
                # 出力ファイル名を生成
                filename = os.path.splitext(os.path.basename(input_path))[0]
                output_path = os.path.join(output_folder, f"{filename}.avif")
                
                if DEBUG_MODE:
                    print(f"[Converter] 変換中: {filename}")
                
                # 変換実行
                self.convert_single_image(input_path, output_path)
                success_count += 1
                
                # 進行状況を通知
                if progress_callback:
                    progress_callback(i, total, filename)
                
            except Exception as e:
                error_count += 1
                error_msg = f"エラー: {os.path.basename(input_path)} - {str(e)}"
                
                if DEBUG_MODE:
                    print(f"[Converter] {error_msg}")
                
                # エラーを通知
                if error_callback:
                    error_callback(os.path.basename(input_path), str(e))
        
        return success_count, error_count
    
    def set_quality(self, quality: int) -> None:
        """
        変換品質を設定
        
        Args:
            quality: 品質設定 (0-100)
        """
        if 0 <= quality <= 100:
            self.quality = quality
        else:
            raise ValueError("品質は0から100の範囲で設定してください")
