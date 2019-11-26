// @flow
//
//  Copyright (c) 2018-present, GM Cruise LLC
//
//  This source code is licensed under the Apache License, Version 2.0,
//  found in the LICENSE file in the root directory of this source tree.
//  You may not use this file except in compliance with the License.

import * as React from "react";
import { connect } from "react-redux";

import { setNodeDiagnostics, type SetNodeDiagnostics } from "webviz-core/src/actions/nodeDiagnostics";
import { importPanelLayout } from "webviz-core/src/actions/panels";
import { remoteBagConnectionURL } from "webviz-core/src/assets/enway_configs";
import DocumentDropListener from "webviz-core/src/components/DocumentDropListener";
import DropOverlay from "webviz-core/src/components/DropOverlay";
import { MessagePipelineProvider } from "webviz-core/src/components/MessagePipeline";
import { getRemoteBagGuid } from "webviz-core/src/dataProviders/getRemoteBagGuid";
import {
  getLocalBagDescriptor,
  getRemoteBagDescriptor,
} from "webviz-core/src/dataProviders/standardDataProviderDescriptors";
import useUserNodes from "webviz-core/src/hooks/useUserNodes";
import NodePlayer from "webviz-core/src/players/NodePlayer";
import RandomAccessPlayer from "webviz-core/src/players/RandomAccessPlayer";
import type { Player } from "webviz-core/src/players/types";
import UserNodePlayer from "webviz-core/src/players/UserNodePlayer";
import type { ImportPanelLayoutPayload, UserNodes } from "webviz-core/src/types/panels";
import demoLayoutJson from "webviz-core/src/util/demoLayout.json";
import {
  DEMO_QUERY_KEY,
  ENABLE_NODE_PLAYGROUND_QUERY_KEY,
  LOAD_ENTIRE_BAG_QUERY_KEY,
  REMOTE_BAG_URL_QUERY_KEY,
  SECOND_BAG_PREFIX,
} from "webviz-core/src/util/globalConstants";
import { getSeekToTime } from "webviz-core/src/util/time";

function buildPlayer(files: File[]): ?Player {
  if (files.length === 0) {
    return undefined;
  } else if (files.length === 1) {
    return new RandomAccessPlayer(getLocalBagDescriptor(files[0]), undefined);
  } else if (files.length === 2) {
    return new RandomAccessPlayer({
      name: "CombinedDataProvider",
      args: { providerInfos: [{}, { prefix: SECOND_BAG_PREFIX }] },
      children: [getLocalBagDescriptor(files[0]), getLocalBagDescriptor(files[1])],
    });
  }
  throw new Error(`Unsupported number of files: ${files.length}`);
}

type OwnProps = { children: React.Node };

type Props = OwnProps & {
  importPanelLayout: (payload: ImportPanelLayoutPayload, isFromUrl: boolean, skipSettingLocalStorage: boolean) => void,
  userNodes: UserNodes,
  setNodeDiagnostics: SetNodeDiagnostics,
};

function PlayerManager({ importPanelLayout, children, userNodes, setNodeDiagnostics }: Props) {
  const usedFiles = React.useRef<File[]>([]);
  const [player, setPlayer] = React.useState();

  React.useEffect(
    () => {
      const params = new URLSearchParams(window.location.search);
      console.log(remoteBagConnectionURL);
      const remoteBagBaseURL = remoteBagConnectionURL;
      const remoteDemoBagUrl =
        "http://storage.enway.ai:9000/bags-studio-16/studio_16_01.bag?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minio%2F20191126%2F%2Fs3%2Faws4_request&X-Amz-Date=20191126T123246Z&X-Amz-Expires=432000&X-Amz-SignedHeaders=host&X-Amz-Signature=336681d16d39b0100893a6eaf26c7b3755feedbe5110f8335810cde27511eb16";
      // http://storage.enway.ai:9000/bags-studio-16/studio_16_01.bag?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minio%2F20191126%2F%2Fs3%2Faws4_request&X-Amz-Date=20191126T100915Z&X-Amz-Expires=432000&X-Amz-SignedHeaders=host&X-Amz-Signature=c1849f7c5763410a270d02f3c8b33669cd8600a5a643bd026b057b707af6dc38
      if (params.has(REMOTE_BAG_URL_QUERY_KEY) || params.has(DEMO_QUERY_KEY)) {
        const url = params.has(REMOTE_BAG_URL_QUERY_KEY)
          ? `${remoteBagBaseURL + params.get(REMOTE_BAG_URL_QUERY_KEY)}&X-Amz-Credential=${params.get(
              "X-Amz-Credential"
            )}&X-Amz-Date=${params.get("X-Amz-Date")}&X-Amz-Expires=${params.get(
              "X-Amz-Expires"
            )}&X-Amz-SignedHeaders=${params.get("X-Amz-SignedHeaders")}&X-Amz-Signature=${params.get(
              "X-Amz-Signature"
            )}` || ""
          : remoteDemoBagUrl;
        getRemoteBagGuid(url).then((guid: ?string) => {
          const newPlayer = new RandomAccessPlayer(
            getRemoteBagDescriptor(url, guid, params.has(LOAD_ENTIRE_BAG_QUERY_KEY)),
            undefined,
            { autoplay: true, seekToTime: getSeekToTime() }
          );

          if (new URLSearchParams(window.location.search).has(ENABLE_NODE_PLAYGROUND_QUERY_KEY)) {
            setPlayer(new UserNodePlayer(newPlayer, setNodeDiagnostics));
          } else {
            setPlayer(new NodePlayer(newPlayer));
          }
        });
        if (params.has(DEMO_QUERY_KEY)) {
          importPanelLayout(demoLayoutJson, false, true);
        }
      }
    },
    [importPanelLayout, setNodeDiagnostics]
  );

  useUserNodes({ nodePlayer: player, userNodes });

  return (
    <>
      <DocumentDropListener
        filesSelected={({ files, shiftPressed }: { files: FileList | File[], shiftPressed: boolean }) => {
          if (shiftPressed && usedFiles.current.length === 1) {
            usedFiles.current = [usedFiles.current[0], files[0]];
          } else if (files.length === 2) {
            usedFiles.current = [...files];
          } else {
            usedFiles.current = [files[0]];
          }
          const player = buildPlayer(usedFiles.current);
          setPlayer(player ? new NodePlayer(player) : undefined);
        }}>
        <DropOverlay>
          <div style={{ fontSize: "4em", marginBottom: "1em" }}>Drop a bag file to load it!</div>
          <div style={{ fontSize: "2em" }}>
            (hold SHIFT while dropping a second bag file to add it
            <br />
            with all topics prefixed with {SECOND_BAG_PREFIX})
          </div>
        </DropOverlay>
      </DocumentDropListener>
      <MessagePipelineProvider player={player}>{children}</MessagePipelineProvider>
    </>
  );
}

export default connect<Props, OwnProps, _, _, _, _>(
  (state) => ({
    userNodes: state.panels.userNodes,
  }),
  { importPanelLayout, setNodeDiagnostics }
)(PlayerManager);
