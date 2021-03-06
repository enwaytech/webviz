// @flow
//
//  Copyright (c) 2018-present, GM Cruise LLC
//
//  This source code is licensed under the Apache License, Version 2.0,
//  found in the LICENSE file in the root directory of this source tree.
//  You may not use this file except in compliance with the License.

import { TimeUtil } from "rosbag";

import ReadAheadDataProvider, { ReadResult } from "./ReadAheadDataProvider";
import MemoryDataProvider from "webviz-core/src/dataProviders/MemoryDataProvider";
import { mockExtensionPoint } from "webviz-core/src/dataProviders/mockExtensionPoint";
import { fromMillis } from "webviz-core/src/util/time";

function generateMessages() {
  const result = [];
  const start = { sec: 0, nsec: 0 };
  for (let i = 0; i < 100; i++) {
    const millis = i * 10;
    const message = {
      receiveTime: TimeUtil.add(start, fromMillis(millis)),
      message: `message: ${i}`,
    };
    result.push({
      ...message,
      topic: "/foo",
    });
    result.push({
      ...message,
      topic: "/bar",
    });
  }
  return result;
}

function getProvider() {
  const memoryDataProvider = new MemoryDataProvider({ messages: generateMessages() });
  return {
    memoryDataProvider,
    provider: new ReadAheadDataProvider(
      { readAheadRange: { sec: 0, nsec: 10 * 1e6 } },
      [{ name: "MemoryDataProvider", args: {}, children: [] }],
      () => memoryDataProvider
    ),
  };
}

describe("ReadResult", () => {
  it("properly response to ranges it overlaps", () => {
    const result = new ReadResult({ sec: 0, nsec: 2 }, { sec: 1, nsec: 0 }, Promise.resolve([]));
    expect(result.overlaps({ sec: 0, nsec: 0 }, { sec: 0, nsec: 1 })).toBe(false);
    expect(result.overlaps({ sec: 0, nsec: 0 }, { sec: 0, nsec: 2 })).toBe(true);
    expect(result.overlaps({ sec: 0, nsec: 0 }, { sec: 2, nsec: 0 })).toBe(true);
    expect(result.overlaps({ sec: 0, nsec: 10 }, { sec: 0, nsec: 11 })).toBe(true);
    expect(result.overlaps({ sec: 1, nsec: 0 }, { sec: 2, nsec: 0 })).toBe(true);
    expect(result.overlaps({ sec: 1, nsec: 1 }, { sec: 2, nsec: 0 })).toBe(false);
  });
  it("handles equal start & end", () => {
    const result = new ReadResult({ sec: 0, nsec: 2 }, { sec: 0, nsec: 2 }, Promise.resolve([]));
    expect(result.overlaps({ sec: 0, nsec: 0 }, { sec: 0, nsec: 1 })).toBe(false);
    expect(result.overlaps({ sec: 0, nsec: 0 }, { sec: 0, nsec: 2 })).toBe(true);
    expect(result.overlaps({ sec: 0, nsec: 1 }, { sec: 0, nsec: 2 })).toBe(true);
    expect(result.overlaps({ sec: 0, nsec: 2 }, { sec: 0, nsec: 2 })).toBe(true);
    expect(result.overlaps({ sec: 0, nsec: 2 }, { sec: 0, nsec: 3 })).toBe(true);
    expect(result.overlaps({ sec: 0, nsec: 3 }, { sec: 0, nsec: 3 })).toBe(false);
  });
});

describe("ReadAheadDataProvider", () => {
  it("can get messages", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);
    const messages = await provider.getMessages(fromMillis(0), fromMillis(10), ["/foo"]);
    expect(messages).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
    ]);
  });

  it("can get messages spanning two read ranges", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);
    const messages = await provider.getMessages(fromMillis(0), fromMillis(20), ["/foo"]);
    expect(messages).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
      {
        receiveTime: fromMillis(20),
        topic: "/foo",
        message: "message: 2",
      },
    ]);
  });

  it("can get messages spanning many read ranges", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);
    const messages = await provider.getMessages(fromMillis(0), fromMillis(40), ["/foo"]);
    expect(messages).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
      {
        receiveTime: fromMillis(20),
        topic: "/foo",
        message: "message: 2",
      },
      {
        receiveTime: fromMillis(30),
        topic: "/foo",
        message: "message: 3",
      },
      {
        receiveTime: fromMillis(40),
        topic: "/foo",
        message: "message: 4",
      },
    ]);
  });

  it("clears cache on topic change", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);
    const messages = await provider.getMessages(fromMillis(0), fromMillis(10), ["/foo"]);
    expect(messages).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
    ]);
    const messages2 = await provider.getMessages(fromMillis(0), fromMillis(10), ["/foo", "/bar"]);
    expect(messages2).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(0),
        topic: "/bar",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/bar",
        message: "message: 1",
      },
    ]);
  });

  it("reuses cache when looking at fewer topics (but does not return the old topics)", async () => {
    const { provider, memoryDataProvider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);
    jest.spyOn(memoryDataProvider, "getMessages");
    const messages1 = await provider.getMessages(fromMillis(0), fromMillis(10), ["/foo", "/bar"]);
    expect(messages1).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(0),
        topic: "/bar",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/bar",
        message: "message: 1",
      },
    ]);
    const originalCalls = memoryDataProvider.getMessages.mock.calls.length;
    expect(memoryDataProvider.getMessages).toHaveBeenCalledTimes(2);
    const messages2 = await provider.getMessages(fromMillis(0), fromMillis(10), ["/foo"]);
    expect(messages2).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
    ]);
    expect(memoryDataProvider.getMessages.mock.calls.length).toEqual(originalCalls);
  });

  it("clears cache when going back in time", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);
    // Get messages from 10-20ms.
    const messages = await provider.getMessages(fromMillis(10), fromMillis(20), ["/foo"]);
    expect(messages).toEqual([
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
      {
        receiveTime: fromMillis(20),
        topic: "/foo",
        message: "message: 2",
      },
    ]);
    // Now request messages from 0-10ms. Since this has overlap with the previously requested
    // messages (in that the message at 10ms occurs in both ranges) we previously incorrectly
    // assumed that we could just use the previously cached result, but then we would miss the
    // message from before 10ms. We should now properly clear the cache in that case and also
    // return the message at 0ms.
    const messages2 = await provider.getMessages(fromMillis(0), fromMillis(10), ["/foo"]);
    expect(messages2).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
    ]);
  });

  it("works when multiple seeks happen in rapid succession", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);

    // Start 2 non-overlapping requests in quick succession.
    const messages = provider.getMessages(fromMillis(30), fromMillis(40), ["/foo"]);
    const messages2 = provider.getMessages(fromMillis(0), fromMillis(10), ["/foo"]);

    // Ensure both requests are eventually resolved with the right data.
    expect(await messages).toEqual([
      {
        receiveTime: fromMillis(30),
        topic: "/foo",
        message: "message: 3",
      },
      {
        receiveTime: fromMillis(40),
        topic: "/foo",
        message: "message: 4",
      },
    ]);

    expect(await messages2).toEqual([
      {
        receiveTime: fromMillis(0),
        topic: "/foo",
        message: "message: 0",
      },
      {
        receiveTime: fromMillis(10),
        topic: "/foo",
        message: "message: 1",
      },
    ]);
  });

  it("works with 3 requests with small ranges", async () => {
    const { provider } = getProvider();
    await provider.initialize(mockExtensionPoint().extensionPoint);

    // Start 2 non-overlapping requests in quick succession.
    const messages1 = provider.getMessages(fromMillis(30), fromMillis(30), ["/foo"]);
    const messages2 = provider.getMessages(fromMillis(30), fromMillis(30), ["/foo"]);
    const messages3 = provider.getMessages(fromMillis(40), fromMillis(50), ["/foo"]);

    expect(await messages1).toEqual([
      {
        receiveTime: fromMillis(30),
        topic: "/foo",
        message: "message: 3",
      },
    ]);

    expect(await messages2).toEqual([
      {
        receiveTime: fromMillis(30),
        topic: "/foo",
        message: "message: 3",
      },
    ]);

    expect(await messages3).toEqual([
      {
        receiveTime: fromMillis(40),
        topic: "/foo",
        message: "message: 4",
      },
      {
        receiveTime: fromMillis(50),
        topic: "/foo",
        message: "message: 5",
      },
    ]);
  });
});
