(ns eca-plugins.secret-guard
  "Secret Guard, as an ECA module: before ECA writes or edits a file, scans
   the new content for hardcoded secrets and makes ECA ask you first, or
   blocks the call.

   It replaces the plugin's `secret-guard.scan` hook on ECA versions with
   modules (0.172.0+), and drops that hook from the config while it's active,
   so exactly one of them runs. ECA versions without modules ignore this
   folder and keep running the hook."
  (:require
   [clojure.string :as string]
   [eca.api :as eca]))

(def ^:private builtin-patterns
  "What looks like a secret: [label regex], matched against each line.
   Keep in sync with hooks/scan-secrets.sh."
  [["AWS access key ID" #"(?i)AKIA[0-9A-Z]{16}"]
   ["AWS secret access key" #"(?i)aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+]{40}"]
   ["API key assignment" #"(?i)api[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]"]
   ["Bearer token" #"(?i)bearer\s+[a-zA-Z0-9_.=-]{20,}"]
   ["Private key" #"(?i)BEGIN\s+(RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY"]
   ["Secret API key (sk-...)" #"(?i)(^|[^a-zA-Z0-9])sk-[a-zA-Z0-9_-]{20,}"]
   ["GitHub token" #"(?i)gh[pousr]_[a-zA-Z0-9]{36,}"]
   ["Secret key assignment" #"(?i)secret[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]"]
   ["Password assignment" #"(?i)password\s*[:=]\s*['\"][^'\"]{8,}"]
   ["Credentials in a URL" #"(?i)://[^:/@\s]+:[^@/\s]+@"]])

(def ^:private reported-invalid
  "The extra patterns the user was already told aren't valid regexes."
  (atom #{}))

(defn- extra-patterns
  "The user's `secretGuard.extraPatterns`, label → regex, as [label pattern]
   pairs. An invalid regex is left out, and the user is told once."
  [ctx extra]
  (when (map? extra)
    (keep (fn [[label regex]]
            (let [label (name label)]
              (try
                [label (re-pattern (str regex))]
                (catch Exception e
                  (when-not (contains? @reported-invalid [label regex])
                    (swap! reported-invalid conj [label regex])
                    (eca/notify! ctx
                                 (format "Secret Guard: ignoring the extra pattern '%s', which isn't a valid regex: %s"
                                         label (first (string/split-lines (str (ex-message e)))))
                                 {:level :warn}))
                  nil))))
          extra)))

(defn- findings
  "Each pattern matching `text`, with the first line it matches:
   [{:label .. :line ..}], in pattern order."
  [patterns text]
  (let [lines (map-indexed vector (string/split-lines text))]
    (keep (fn [[label pattern]]
            (some (fn [[i line]]
                    (when (re-find pattern line)
                      {:label label :line (inc i)}))
                  lines))
          patterns)))

(defn- describe
  "The findings for people, e.g. \"AWS access key ID (line 2)\": labels and
   line numbers only, never the matched text."
  [findings edit?]
  (string/join ", " (for [{:keys [label line]} findings]
                      (format "%s (%s %d)" label (if edit? "new-text line" "line") line))))

(defn- scan-write
  "`:tool/before-call` handler for eca__write_file and eca__edit_file: on a
   possible secret, makes an allowed call ask, or blocks it when
   `secretGuard.action` is \"block\". A call the config denies stays denied."
  [ctx {:keys [tool arguments approval]}]
  (let [text (or (get arguments "content") (get arguments "new_content"))]
    (when (and (not= :deny approval) (string? text))
      (let [settings (:secretGuard (eca/config ctx))
            found (findings (concat builtin-patterns (extra-patterns ctx (:extraPatterns settings)))
                            text)]
        (when (seq found)
          (let [edit? (= "eca__edit_file" tool)
                path (or (get arguments "path") "the file")
                where (if edit? (str "the edit to " path) path)
                what (describe found edit?)]
            (if (= "block" (some-> (:action settings) name))
              (do (eca/notify! ctx (format "Secret Guard blocked a change with a possible secret in %s: %s." where what)
                               {:level :warn})
                  {:block (format (str "Secret Guard blocked this call: possible secret in %s: %s. "
                                       "Don't hardcode credentials: read them from environment variables "
                                       "or a secrets manager instead.")
                                  where what)})
              (do (eca/notify! ctx (format "Secret Guard: possible secret in %s: %s. Review the change before approving it."
                                           where what)
                               {:level :warn})
                  (cond-> {:additional-context
                           (format (str "Secret Guard found a possible secret in %s: %s, so the user was asked "
                                        "to approve this call. If it's a real credential, read it from an "
                                        "environment variable or a secrets manager instead of hardcoding it.")
                                   where what)}
                    (= :allow approval) (assoc :approval :ask))))))))))

(defn- legacy-hook?
  "Whether `hook-name` is this plugin's hook: `<plugin>::secret-guard.scan`."
  [hook-name]
  (and (or (string? hook-name) (keyword? hook-name))
       (string/ends-with? (name hook-name) "::secret-guard.scan")))

(defn- drop-legacy-hook
  "`:config/resolve` handler: drops the plugin's `secret-guard.scan` hook,
   which this module replaces, so a write isn't scanned twice. When the
   module is disabled or fails, this doesn't run and the hook stays."
  [_ctx {:keys [config]}]
  (let [hooks (:hooks config)]
    (when (and (map? hooks) (some legacy-hook? (keys hooks)))
      {:config (assoc config :hooks (into {} (remove (comp legacy-hook? key)) hooks))})))

(def module
  {:id :eca-plugins/secret-guard
   :description "Asks before ECA writes content that looks like a hardcoded secret."
   :version "1.0.0"
   :config-spec {:secretGuard
                 {:action {:type :enum
                           :values ["ask" "block"]
                           :default "ask"
                           :doc (str "On a possible secret: \"ask\" makes ECA ask you before writing it, "
                                     "even in trust mode; \"block\" rejects the call and tells the model why.")}
                  :extraPatterns {:type :map
                                  :doc (str "More secrets to look for: a label for each, and a Java regex matched "
                                            "against each line, e.g. {\"Internal token\": \"itk_[a-z0-9]{32}\"}.")}}}
   :event-handlers {:tool/before-call {:match {:tool #{"eca__write_file" "eca__edit_file"}}
                                       :handler scan-write}
                    :config/resolve drop-legacy-hook}})
