"""Build a plain-Python-cell notebook; keep its install/runtime steps reviewable."""

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
cells = []


def markdown(text):
    cells.append(
        {
            "cell_type": "markdown",
            "metadata": {},
            "source": text.strip().splitlines(keepends=True),
        }
    )


def code(text):
    text = text.strip() + "\n"
    ast.parse(text)
    cells.append(
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": text.splitlines(keepends=True),
        }
    )


markdown("""# VYUMI: Kaggle GPU virtual try-on

Educational/noncommercial IDM-VTON demo. The official source/checkpoints use CC BY-NC-SA 4.0: https://github.com/yisol/IDM-VTON#license. This is not a commercial-use clearance or a guarantee of saree, identity, body-shape or fit accuracy.

Enable **Internet** and a **GPU** in Kaggle settings. Add Kaggle Secrets named `NGROK_AUTHTOKEN` and `VYUMI_GPU_TOKEN`; the latter must be a unique random secret of at least 24 characters matching the backend setting. Do not put either secret in notebook cells, outputs or Git. Keep the notebook private when testing personal photos.

The first setup downloads several GB and builds Detectron2. No 15–20 second inference promise is made. This notebook uses an isolated Python 3.10 / PyTorch 2.0.1 CUDA 11.8 environment compatible with the pinned upstream code, instead of changing Kaggle's own kernel dependencies. CPU contract tests do not prove CUDA inference; the live smoke-test cell below must pass on your GPU.
""")

code("""
import os, sys, subprocess, urllib.request, tarfile, shutil, time, json
from pathlib import Path

RUNTIME = Path('/kaggle/working/vyumi-runtime') if Path('/kaggle').exists() else Path('/content/vyumi-runtime')
RUNTIME.mkdir(parents=True, exist_ok=True)
PROJECT = RUNTIME / 'platform'
PROJECT_REPO = 'https://github.com/amrit2603/Style-it-your-way.git'
if not PROJECT.exists():
    subprocess.run(['git', 'clone', '--depth', '1', PROJECT_REPO, str(PROJECT)], check=True)
assert (PROJECT / 'ai-services/serve.py').is_file(), 'Use the repository revision containing the Kaggle service'
print('Runtime directory:', RUNTIME)
print('Free disk (GiB):', round(shutil.disk_usage(RUNTIME).free / 1024**3, 1))
""")

markdown("""## Create the isolated environment
Micromamba comes from its official distribution endpoint. Package versions are pinned; source revisions are verified before execution. Keep the environment and model cache out of saved notebook outputs when possible.
""")

code("""
MICROMAMBA = RUNTIME / 'micromamba'
if not MICROMAMBA.exists():
    archive = RUNTIME / 'micromamba.tar.bz2'
    urllib.request.urlretrieve('https://micro.mamba.pm/api/micromamba/linux-64/latest', archive)
    with tarfile.open(archive) as bundle:
        with bundle.extractfile('bin/micromamba') as source:
            MICROMAMBA.write_bytes(source.read())
    MICROMAMBA.chmod(0o755)
ENV = RUNTIME / 'python310'
PYTHON = ENV / 'bin/python'
if not PYTHON.exists():
    subprocess.run([str(MICROMAMBA), 'create', '-y', '-p', str(ENV), '-c', 'conda-forge', 'python=3.10', 'pip=23.3.1'], check=True)
subprocess.run([str(MICROMAMBA), 'install', '-y', '-p', str(ENV), '-c', 'nvidia/label/cuda-11.8.0', '-c', 'conda-forge', 'cuda-toolkit=11.8', 'gcc_linux-64=11', 'gxx_linux-64=11'], check=True)
subprocess.run([str(PYTHON), '-m', 'pip', 'install', 'torch==2.0.1', 'torchvision==0.15.2', '--index-url', 'https://download.pytorch.org/whl/cu118'], check=True)
subprocess.run([str(PYTHON), '-m', 'pip', 'install', '-r', str(PROJECT / 'ai-services/requirements-kaggle.txt')], check=True)
subprocess.run([str(PYTHON), '-c', 'import torch; assert torch.cuda.is_available(), "Enable a Kaggle CUDA GPU"; print("CUDA ready:", torch.cuda.get_device_name(0))'], check=True)
""")

markdown("""## Fetch pinned upstream source and preprocessing dependencies
The official demo needs human parsing, OpenPose and DensePose in addition to the diffusion pipeline. A plain `diffusers.from_pretrained` call is insufficient. Source and checkpoint revisions below are recorded for reproducibility.
""")

code("""
IDM = RUNTIME / 'IDM-VTON'
IDM_REVISION = '06ad89ba2f78d77a5ba21d7f7fd392254971fda2'
DETECTRON = RUNTIME / 'detectron2'
DETECTRON_REVISION = '0df2d73d0013db7de629602c23cc120219b4f2b8'
for url, destination, revision in [
    ('https://github.com/yisol/IDM-VTON.git', IDM, IDM_REVISION),
    ('https://github.com/facebookresearch/detectron2.git', DETECTRON, DETECTRON_REVISION),
]:
    if not destination.exists():
        subprocess.run(['git', 'clone', url, str(destination)], check=True)
    subprocess.run(['git', '-C', str(destination), 'checkout', revision], check=True)
    assert subprocess.check_output(['git', '-C', str(destination), 'rev-parse', 'HEAD'], text=True).strip() == revision
build_env = dict(os.environ, CUDA_HOME=str(ENV), PATH=str(ENV / 'bin') + ':' + os.environ['PATH'], FORCE_CUDA='1', MAX_JOBS='2', CC=str(ENV / 'bin/x86_64-conda-linux-gnu-gcc'), CXX=str(ENV / 'bin/x86_64-conda-linux-gnu-g++'))
subprocess.run([str(PYTHON), '-m', 'pip', 'install', '--no-build-isolation', str(DETECTRON)], env=build_env, check=True)
subprocess.run([str(PYTHON), '-m', 'pip', 'install', '--no-build-isolation', str(DETECTRON / 'projects/DensePose')], env=build_env, check=True)
""")

code("""
download_script = r'''
import os
from huggingface_hub import snapshot_download, hf_hub_download
model_dir = snapshot_download(repo_id='yisol/IDM-VTON', revision='585a32e74aee241cbc0d0cc3ab21392ca58c916a', allow_patterns=['model_index.json','unet/*','unet_encoder/*','vae/*','tokenizer/*','tokenizer_2/*','text_encoder/*','text_encoder_2/*','image_encoder/*','scheduler/*'])
for filename in ['ckpt/densepose/model_final_162be9.pkl','ckpt/humanparsing/parsing_atr.onnx','ckpt/humanparsing/parsing_lip.onnx','ckpt/openpose/ckpts/body_pose_model.pth']:
    hf_hub_download(repo_id='yisol/IDM-VTON', repo_type='space', revision='906d38c8a74e7c1cd0bf714a363fe2e939fa28b8', filename=filename, local_dir=os.environ['VYUMI_IDM_SOURCE'])
open(os.environ['VYUMI_MODEL_PATH_FILE'], 'w').write(model_dir)
'''
runtime_env = dict(os.environ, HF_HOME=str(RUNTIME / 'hf-cache'), VYUMI_IDM_SOURCE=str(IDM), VYUMI_MODEL_PATH_FILE=str(RUNTIME / 'model-path.txt'))
subprocess.run([str(PYTHON), '-c', download_script], env=runtime_env, check=True)
MODEL = Path((RUNTIME / 'model-path.txt').read_text().strip())
assert MODEL.is_dir()
""")

markdown("""## Start the authenticated API
`/health` reports ready only after the model is loaded. `/try-on` accepts person and garment uploads, a clothing category, Bearer authentication and a stable `X-Request-ID`. The service serializes inference and caches two successful requests for up to one hour so a timeout retry does not generate twice. Inputs are not written to a public directory. Outputs and process memory disappear when the session ends; local deletion in the storefront cannot erase data already received by an external GPU host.
""")

code("""
try:
    from kaggle_secrets import UserSecretsClient
    secret_client = UserSecretsClient()
    gpu_token = secret_client.get_secret('VYUMI_GPU_TOKEN')
except ImportError:
    from getpass import getpass
    gpu_token = getpass('GPU API token (matches backend): ')
assert len(gpu_token) >= 24, 'Configure a GPU API token of at least 24 characters'
runtime_env.update(VYUMI_IDM_MODEL=str(MODEL), VYUMI_GPU_TOKEN=gpu_token)
log_file = open(RUNTIME / 'gpu.log', 'a')
gpu_process = subprocess.Popen([str(PYTHON), str(PROJECT / 'ai-services/serve.py')], env=runtime_env, stdout=log_file, stderr=subprocess.STDOUT)
for attempt in range(300):
    if gpu_process.poll() is not None:
        raise RuntimeError('GPU process exited. Inspect the private gpu.log file; do not publish secrets or personal photos.')
    try:
        with urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=2) as response:
            health = json.load(response)
        assert health['gpu_ready'] is True and health['engine'] == 'IDM-VTON'
        print('IDM-VTON API is loaded and ready.')
        break
    except (OSError, ValueError):
        time.sleep(2)
else:
    raise RuntimeError('Model startup timed out. Inspect gpu.log and available GPU memory.')
""")

markdown("""## Independent real-inference test
This sends two fictional adult demonstration images to the loaded model. It is a connectivity/inference smoke test, not an identity or saree-quality benchmark. Inspect the output before using it. Never replace a failure with a fixed sample and call it personalized.
""")

code("""
smoke_script = r'''
import os, base64, time, uuid
from pathlib import Path
import httpx
root = Path(os.environ['VYUMI_PROJECT'])
started = time.monotonic()
with httpx.Client(timeout=180) as client:
    response = client.post('http://127.0.0.1:7860/try-on', headers={'Authorization':'Bearer '+os.environ['VYUMI_GPU_TOKEN'], 'X-Request-ID':str(uuid.uuid4())}, files={'person_image':('person.png',(root/'demo/ivory-suit.png').read_bytes(),'image/png'),'garment_image':('garment.png',(root/'demo/emerald-saree.png').read_bytes(),'image/png')}, data={'category':'saree'})
    response.raise_for_status()
    Path(os.environ['VYUMI_SMOKE_RESULT']).write_bytes(base64.b64decode(response.json()['image_base64'], validate=True))
print('Live inference completed in', round(time.monotonic()-started,1), 'seconds. Inspect identity and garment details.')
'''
runtime_env.update(VYUMI_PROJECT=str(PROJECT), VYUMI_SMOKE_RESULT=str(RUNTIME / 'smoke-result.jpg'))
subprocess.run([str(PYTHON), '-c', smoke_script], env=runtime_env, check=True)
from IPython.display import display, Image as DisplayImage
display(DisplayImage(filename=str(RUNTIME / 'smoke-result.jpg')))
""")

markdown("""## Open the ngrok tunnel after the live test passes
The URL is public, but inference still requires the separate GPU Bearer token. Keep the backend and customer files private. Copy the HTTPS origin to `VYUMI_KAGGLE_API_URL`; set `VYUMI_KAGGLE_API_TOKEN` to the same secret you supplied above and `VYUMI_TRYON_PROVIDER=kaggle` in private `backend/.env`, then restart the backend. Do not paste either token into chat or frontend code.
""")

code("""
if 'secret_client' in globals():
    ngrok_token = secret_client.get_secret('NGROK_AUTHTOKEN')
else:
    from getpass import getpass
    ngrok_token = getpass('ngrok auth token (tunnel only): ')
assert ngrok_token, 'Configure your ngrok account auth token'
runtime_env['NGROK_AUTHTOKEN'] = ngrok_token
tunnel_script = r'''
import json, os, time
from pathlib import Path
from pyngrok import ngrok
ngrok.set_auth_token(os.environ['NGROK_AUTHTOKEN'])
tunnel = ngrok.connect(7860, bind_tls=True)
Path(os.environ['VYUMI_TUNNEL_FILE']).write_text(json.dumps({'url': tunnel.public_url}))
while True:
    time.sleep(5)
'''
tunnel_file = RUNTIME / 'tunnel.json'
tunnel_file.unlink(missing_ok=True)
runtime_env['VYUMI_TUNNEL_FILE'] = str(tunnel_file)
ngrok_process = subprocess.Popen([str(PYTHON), '-c', tunnel_script], env=runtime_env, stdout=log_file, stderr=subprocess.STDOUT)
for _ in range(30):
    if ngrok_process.poll() is not None:
        raise RuntimeError('ngrok exited. Inspect the private log and account limits.')
    if tunnel_file.exists():
        public_url = json.loads(tunnel_file.read_text())['url']
        assert public_url.startswith('https://')
        print('VYUMI_KAGGLE_API_URL=' + public_url)
        print('Use the matching private GPU token in the backend; it is not printed here.')
        break
    time.sleep(1)
else:
    raise RuntimeError('Tunnel startup timed out')
""")

markdown("""## Keep the session running; stop cleanly
Run the next cell to keep the notebook active. Interrupt it to shut down both children. Kaggle GPU/session/network limits still apply; restarting the notebook changes the tunnel URL and clears the in-memory replay cache. After a GPU restart, backend requests with uncertain submission status need review before a new attempt. Models may alter identity, body shape, saree borders and multi-piece outfits. Watches/shoes are not supported by IDM-VTON; room placement uses the backend's labelled CPU compositor.
""")
code("""
try:
    gpu_process.wait()
finally:
    ngrok_process.terminate()
    gpu_process.terminate()
    log_file.close()
    gpu_token = ngrok_token = None
    runtime_env.pop('VYUMI_GPU_TOKEN', None)
    runtime_env.pop('NGROK_AUTHTOKEN', None)
""")

for index, cell in enumerate(cells):
    cell["id"] = f"vyumi-{index:02}"

notebook = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {"name": "python"},
        "accelerator": "GPU",
    },
    "cells": cells,
}
target = ROOT / "notebooks/vyumi_idmvton_kaggle.ipynb"
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(notebook, indent=2) + "\n", encoding="utf-8")
colab_target = target.with_name("vyumi_idmvton_colab.ipynb")
colab = json.loads(json.dumps(notebook))
colab["metadata"]["colab"] = {"name": colab_target.name, "provenance": []}
colab["cells"][0]["source"] = (
    "".join(colab["cells"][0]["source"])
    .replace("Kaggle GPU virtual try-on", "Colab GPU virtual try-on")
    .replace(
        "Enable **Internet** and a **GPU** in Kaggle settings. Add Kaggle Secrets named `NGROK_AUTHTOKEN` and `VYUMI_GPU_TOKEN`; the latter must be a unique random secret of at least 24 characters matching the backend setting.",
        "Select **Runtime → Change runtime type → GPU** in Colab. Secure prompts request `NGROK_AUTHTOKEN` and `VYUMI_GPU_TOKEN`; the latter must be a unique random secret of at least 24 characters matching the backend setting.",
    )
    .splitlines(keepends=True)
)
colab_target.write_text(json.dumps(colab, indent=2) + "\n", encoding="utf-8")
print(f"Built {target.name}: {len(cells)} cells, code syntax checked.")

if __name__ == "__main__":
    for cell in cells:
        if cell["cell_type"] == "code":
            ast.parse("".join(cell["source"]))
