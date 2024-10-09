import {
    AttachmentBuilder,
    Client,
    EmbedBuilder,
    Events,
    ForumChannel,
    IntentsBitField,
    TextChannel,
} from "discord.js";
import express, {Application, NextFunction, Request, Response} from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import {STATUS_CODES} from 'http';

export const expressJsonErrorHandler = (err: any, req: Request, res: Response, _: NextFunction) => {
    let status = err.status ?? err.statusCode ?? 500;
    if (status < 400) {
        status = 500;
    }

    res.status(status);
    const body: Record<string, any> = {
        status,
    };

    if (process.env.NODE_ENV !== 'production') {
        body.stack = err.stack;
    }

    if (status >= 500) {
        body.message = STATUS_CODES[status];
        res.json(body);
        return;
    }

    body.message = err.message ?? body.message;
    body.code = err.code ?? body.code;
    body.name = err.name;
    body.type = err.type;

    res.json(body);
};

function fail(error: any): never {
    console.error(error);
    throw new Error(error);
}

function assert(value: any, name: string): void | never {
    if (!value) {
        return fail(name + " is required.");
    }
}

function isPrerelease(title: string): boolean {
    return title.indexOf('-pre') >= 0 || title.indexOf('-rc') >= 0;
}

function extractImagesFromDescription(description: string): {
    text: string,
    images: AttachmentBuilder[]
} {
    const images: AttachmentBuilder[] = [];
    const text = description.replace(/!\[([^\]\r\n]+)]\(([^)\r\n]+)\)/g, (str, description, url) => {
        images.push(new AttachmentBuilder(url).setDescription(description));
        description = 'image' + images.length + ':' + description;
        return `[${description}]`;
    });

    console.info('Extracted images from description: ', images.map(image => image.attachment));

    return {
        text,
        images
    }
}

dotenv.config();

const app: Application = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(haltOnTimedOut);

function haltOnTimedOut(req: Request, res: Response, next: NextFunction) {
    if (!req.timedout) {
        next();
    }
}

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log("Server listening on", PORT);
});
server.requestTimeout = 5000;
server.headersTimeout = 2000;
server.keepAliveTimeout = 3000;

app.get('/version', (request, response) => {
    const status = {
        version: '1.3.0',
        status: 'Running',
    };
    console.log(`Requested status`, status);
    response.send(status);
});

app.post(
    '/channel/:channel/topic/:topic/announce',
    async (request: Request, response: Response, next) => {
        const {channel, topic} = request.params ?? {};
        const {
            // TODO: Rename to token.
            secret: token,
            title,
            link,
            author,
            description,
        } = request.body ?? {};

        try {
            assert(token, "Bot token");
            assert(channel, "Channel ID");
            assert(topic, "Topic ID");
            assert(title, "Post title");
            assert(link, "Post link");

            const client = new Client({intents: [IntentsBitField.Flags.Guilds]});

            client.once(Events.ClientReady, async () => {
                try {
                    console.log("Bot is ready");

                    const announcementChannel = await client.channels.fetch(channel) as ForumChannel;
                    if (announcementChannel) {
                        console.log(`Found channel '${announcementChannel.name}' (${channel})`);
                    } else {
                        return fail(`Channel with id ${channel} not found`);
                    }

                    const modTopic = await announcementChannel.threads.fetch(topic);
                    if (modTopic) {
                        console.log(`Found topic '${modTopic.name}' (${topic})`);
                    } else {
                        return fail(`Topic with id ${topic} not found`);
                    }

                    const {text, images} = extractImagesFromDescription(description || '');

                    const embed = new EmbedBuilder()
                        .setTitle(title)
                        .setColor(isPrerelease(title) ? 'Navy' : 'Blurple')
                        .setURL(link)
                        .setDescription(text)
                        .setAuthor({
                            name: author || 'madtisa',
                            iconURL: 'https://cdn.discordapp.com/avatars/1036860169382015007/45c6dbecf5e2da6f01ff5cefb679d965.webp'
                        })
                        .setTimestamp();

                    const sentMessage = await (modTopic as unknown as TextChannel).send({
                        embeds: [embed],
                        files: images
                    });
                    console.info("Message has been sent successfully", sentMessage);

                    response.status(204);
                    response.send();
                } catch (err) {
                    next(err);
                }
            });

            await client.login(token);
            console.log(`Logged in successfully`);
        } catch (error) {
            next(error);
        }
    }
);

app.use(expressJsonErrorHandler);
