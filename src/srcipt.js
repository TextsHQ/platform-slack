const { WebClient } = require('@slack/web-api')

const token = "xapp-xxxx-xxxxx";

const web = new WebClient(token);

const getThreads = async () => {
  try {
    const result = await web.users.conversations({
      token
    });
    return result.body.channels || [];
  } catch (e) {
    console.log(e);
    return [];
  }
};

const getMessages = async (threadId, ts) => {
  try {
    const result = await web.conversations.replies({
      token,
      channel: threadId,
      ts
    });
    return result.body.messages || [];
  } catch (e) {
    console.log(e);
    return [];
  }
};

const sendMessage = async (threadId) => {
  try {
    const result = await web.conversations.replies({
      token,
      channel: threadId
    });
    return result.body.message || {};
  } catch (e) {
    console.log(e);
    return {};
  }
}
