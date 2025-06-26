Set the REPLICATE_API_TOKEN environment variable

export REPLICATE_API_TOKEN=r8_NBY**********************************

Learn more about authentication

Install Replicate’s Node.js client library

npm install replicate

Learn more about setup

Run bytedance/seedream-3 using Replicate’s API. Check out the model's schema for an overview of inputs and outputs.

import { writeFile } from "fs/promises";
import Replicate from "replicate";
const replicate = new Replicate();

const input = {
    prompt: "A cinematic, photorealistic medium shot capturing the nostalgic warmth of a mid-2000s indie film. The focus is a young woman with a sleek, straight bob haircut in cool platinum white with freckled skin, looking directly and intently into the camera lens with a knowing smirk, her head is looking up slightly. She wears an oversized band t-shirt that says \"Seedream 3.0 on Replicate\" in huge stylized text over a long-sleeved striped top and simple silver stud earrings. The lighting is soft, golden hour sunlight creating lens flare and illuminating dust motes in the air. The background shows a blurred outdoor urban setting with graffiti-covered walls (the graffiti says \"seedream\" in stylized graffiti lettering), rendered with a shallow depth of field. Natural film grain, a warm, slightly muted color palette, and sharp focus on her expressive eyes enhance the intimate, authentic feel"
};

const output = await replicate.run("bytedance/seedream-3", { input });
await writeFile("output.jpg", output);
//=> output.jpg written to disk

Learn more
Replicate
All services are online
Home
About
Join us
Terms
Privacy
Status
Support


Authentication

Whenever you make an API request, you need to authenticate using a token. A token is like a password that uniquely identifies your account and grants you access.

The following examples all expect your Replicate access token to be available from the command line. Because tokens are secrets, they should not be in your code. They should instead be stored in environment variables. Replicate clients look for the REPLICATE_API_TOKEN environment variable and use it if available.

To set this up you can use:

export REPLICATE_API_TOKEN=r8_NBY**********************************

Some application frameworks and tools also support a text file named .env which you can edit to include the same token:

REPLICATE_API_TOKEN=r8_NBY**********************************

The Replicate API uses the Authorization HTTP header to authenticate requests. If you’re using a client library this is handled for you.

You can test that your access token is setup correctly by using our account.get endpoint:
What is cURL?

curl https://api.replicate.com/v1/account -H "Authorization: Bearer $REPLICATE_API_TOKEN"
# {"type":"user","username":"aron","name":"Aron Carroll","github_url":"https://github.com/aron"}

If it is working correctly you will see a JSON object returned containing some information about your account, otherwise ensure that your token is available:

echo "$REPLICATE_API_TOKEN"
# "r8_xyz"

Setup

NodeJS supports two module formats ESM and CommonJS. Below details the setup for each environment. After setup, the code is identical regardless of module format.
ESM

First you’ll need to ensure you have a NodeJS project:

npm create esm -y

Then install the replicate JavaScript library using npm:

npm install replicate

To use the library, first import and create an instance of it:

import Replicate from "replicate";

const replicate = new Replicate();

This will use the REPLICATE_API_TOKEN API token you’ve setup in your environment for authorization.
CommonJS

First you’ll need to ensure you have a NodeJS project:

npm create -y

Then install the replicate JavaScript library using npm:

npm install replicate

To use the library, first import and create an instance of it:

const Replicate = require("replicate");

const replicate = new Replicate();

This will use the REPLICATE_API_TOKEN API token you’ve setup in your environment for authorization.
Run the model

Use the replicate.run() method to run the model:

const input = {
    prompt: "A cinematic, photorealistic medium shot capturing the nostalgic warmth of a mid-2000s indie film. The focus is a young woman with a sleek, straight bob haircut in cool platinum white with freckled skin, looking directly and intently into the camera lens with a knowing smirk, her head is looking up slightly. She wears an oversized band t-shirt that says \"Seedream 3.0 on Replicate\" in huge stylized text over a long-sleeved striped top and simple silver stud earrings. The lighting is soft, golden hour sunlight creating lens flare and illuminating dust motes in the air. The background shows a blurred outdoor urban setting with graffiti-covered walls (the graffiti says \"seedream\" in stylized graffiti lettering), rendered with a shallow depth of field. Natural film grain, a warm, slightly muted color palette, and sharp focus on her expressive eyes enhance the intimate, authentic feel"
};

const output = await replicate.run("bytedance/seedream-3", { input });
await writeFile("output.jpg", output);
//=> output.jpg written to disk

You can learn about pricing for this model on the model page.

The run() function returns the output directly, which you can then use or pass as the input to another model. If you want to access the full prediction object (not just the output), use the replicate.predictions.create() method instead. This will include the prediction id, status, logs, etc.
Prediction lifecycle

Running predictions and trainings can often take significant time to complete, beyond what is reasonable for an HTTP request/response.

When you run a model on Replicate, the prediction is created with a “starting” state, then instantly returned. This will then move to "processing" and eventual one of “successful”, "failed" or "canceled".
Starting
Running
Succeeded
Failed
Canceled

You can explore the prediction lifecycle by using the predictions.get() method to retrieve the latest version of the prediction until completed.
Show example

Webhooks

Webhooks provide real-time updates about your prediction. Specify an endpoint when you create a prediction, and Replicate will send HTTP POST requests to that URL when the prediction is created, updated, and finished.

It is possible to provide a URL to the predictions.create() function that will be requested by Replicate when the prediction status changes. This is an alternative to polling.

To receive webhooks you’ll need a web server. The following example uses Hono, a web standards based server, but this pattern applies to most frameworks.
Show example

Then create the prediction passing in the webhook URL and specify which events you want to receive out of "start", "output", ”logs” and "completed".

const input = {
    prompt: "A cinematic, photorealistic medium shot capturing the nostalgic warmth of a mid-2000s indie film. The focus is a young woman with a sleek, straight bob haircut in cool platinum white with freckled skin, looking directly and intently into the camera lens with a knowing smirk, her head is looking up slightly. She wears an oversized band t-shirt that says \"Seedream 3.0 on Replicate\" in huge stylized text over a long-sleeved striped top and simple silver stud earrings. The lighting is soft, golden hour sunlight creating lens flare and illuminating dust motes in the air. The background shows a blurred outdoor urban setting with graffiti-covered walls (the graffiti says \"seedream\" in stylized graffiti lettering), rendered with a shallow depth of field. Natural film grain, a warm, slightly muted color palette, and sharp focus on her expressive eyes enhance the intimate, authentic feel"
};

const callbackURL = `https://my.app/webhooks/replicate`;
await replicate.predictions.create({
  model: "bytedance/seedream-3",
  input: input,
  webhook: callbackURL,
  webhook_events_filter: ["completed"],
});

// The server will now handle the event and log:
// => {"id": "xyz", "status": "successful", ... }

ℹ️ The replicate.run() method is not used here. Because we're using webhooks, and we don’t need to poll for updates.

Co-ordinating between a prediction request and a webhook response will require some glue. A simple implementation for a single JavaScript server could use an event emitter to manage this.
Show example

From a security perspective it is also possible to verify that the webhook came from Replicate. Check out our documentation on verifying webhooks for more information.
Access a prediction

You may wish to access the prediction object. In these cases it’s easier to use the replicate.predictions.create() or replicate.deployments.predictions.create() functions which will return the prediction object.

Though note that these functions will only return the created prediction, and it will not wait for that prediction to be completed before returning. Use replicate.predictions.get() to fetch the latest prediction.

const input = {
    prompt: "A cinematic, photorealistic medium shot capturing the nostalgic warmth of a mid-2000s indie film. The focus is a young woman with a sleek, straight bob haircut in cool platinum white with freckled skin, looking directly and intently into the camera lens with a knowing smirk, her head is looking up slightly. She wears an oversized band t-shirt that says \"Seedream 3.0 on Replicate\" in huge stylized text over a long-sleeved striped top and simple silver stud earrings. The lighting is soft, golden hour sunlight creating lens flare and illuminating dust motes in the air. The background shows a blurred outdoor urban setting with graffiti-covered walls (the graffiti says \"seedream\" in stylized graffiti lettering), rendered with a shallow depth of field. Natural film grain, a warm, slightly muted color palette, and sharp focus on her expressive eyes enhance the intimate, authentic feel"
};
const prediction = replicate.predictions.create({
  model: "bytedance/seedream-3",
  input
});
// { "id": "xyz123", "status": "starting", ... }

Cancel a prediction

You may need to cancel a prediction. Perhaps the user has navigated away from the browser or canceled your application. To prevent unnecessary work and reduce runtime costs you can use the replicate.predictions.cancel function and pass it a prediction id.

await replicate.predictions.cancel(prediction.id);

{
  "type": "object",
  "title": "Input",
  "required": [
    "prompt"
  ],
  "properties": {
    "seed": {
      "type": "integer",
      "title": "Seed",
      "x-order": 1,
      "nullable": true,
      "description": "Random seed. Set for reproducible generation"
    },
    "size": {
      "enum": [
        "small",
        "regular",
        "big"
      ],
      "type": "string",
      "title": "size",
      "description": "Big images will have their longest dimension be 2048px. Small images will have their shortest dimension be 512px. Regular images will always be 1 megapixel. Ignored if aspect ratio is custom.",
      "default": "regular",
      "x-order": 3
    },
    "width": {
      "type": "integer",
      "title": "Width",
      "default": 2048,
      "maximum": 2048,
      "minimum": 512,
      "x-order": 4,
      "description": "Image width"
    },
    "height": {
      "type": "integer",
      "title": "Height",
      "default": 2048,
      "maximum": 2048,
      "minimum": 512,
      "x-order": 5,
      "description": "Image height"
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "Text prompt for image generation"
    },
    "aspect_ratio": {
      "enum": [
        "1:1",
        "3:4",
        "4:3",
        "16:9",
        "9:16",
        "2:3",
        "3:2",
        "21:9",
        "custom"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "Image aspect ratio. Set to 'custom' to specify width and height.",
      "default": "16:9",
      "x-order": 2
    },
    "guidance_scale": {
      "type": "number",
      "title": "Guidance Scale",
      "default": 2.5,
      "maximum": 10,
      "minimum": 1,
      "x-order": 6,
      "description": "Prompt adherence. Higher = more literal."
    }
  }
}