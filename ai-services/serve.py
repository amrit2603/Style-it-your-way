import os

import uvicorn
from gpu_server import create_app
from idmvton_runner import IDMRunner

runner = IDMRunner(os.environ["VYUMI_IDM_SOURCE"], os.environ["VYUMI_IDM_MODEL"])
app = create_app(runner, os.environ["VYUMI_GPU_TOKEN"])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7860, access_log=False)
