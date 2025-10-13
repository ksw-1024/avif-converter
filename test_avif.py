"""AVIF変換のテストスクリプト"""
from PIL import Image
import pillow_avif

# AVIFサポートの確認
print("Pillow version:", Image.__version__)
print("Available formats:", Image.registered_extensions())
print("AVIF supported:", '.avif' in Image.registered_extensions().values())

# テスト画像の作成と変換
try:
    # 100x100の赤い画像を作成
    img = Image.new('RGB', (100, 100), color='red')
    
    # AVIF形式で保存を試みる
    img.save('test_output.avif', 'AVIF', quality=85)
    print("\n✓ AVIF変換テスト成功！test_output.avifを作成しました")
    
    # 保存したファイルを開いて確認
    with Image.open('test_output.avif') as test_img:
        print(f"✓ 保存したファイルを正常に開けました: {test_img.size}, {test_img.mode}")
    
except Exception as e:
    print(f"\n✗ エラー: {e}")
    import traceback
    traceback.print_exc()
