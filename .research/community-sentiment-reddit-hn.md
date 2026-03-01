# Community Sentiment: Reddit & Hacker News Developer Opinions

Research conducted: 2026-02-13
Sources: Reddit (r/semanticweb, r/MachineLearning, r/LocalLLaMA, r/KnowledgeGraph, r/LLMDevs, r/neo4j) and Hacker News

---

## 1. RDF vs Property Graphs: What Real Developers Say

### The Developer Experience Gap (Property Graphs Win on DX)

The consistent theme across all forums: **property graphs win on developer experience, RDF wins on semantic rigor, and most practitioners pick whatever they know.**

From r/MachineLearning, a practitioner working in finance noted the core issue:
> "One of the main reasons I think that GNNs aren't gaining mainstream traction is the perceived (and to some extent, real) difficulty of using graph databases. Graph DBs, historically, haven't been easy to set up and use." (u/laminarflow027, +15)

Another r/MachineLearning commenter highlighted the practical reality:
> "Gathering (and reconciling!!!) data for the KG is very difficult on its own. If you think of companies, what exactly is a company?" (u/bbu3, +9)

On HN, a developer with four commercial semantic web projects stated bluntly:
> "All these projects or at least their semantic web part were a failure," attributing this to **RDF being fundamentally incompatible with how people naturally structure data.**

The GraphGeeks community and independent analyses consistently note: "Property graphs scored with developers by appearing to get out of the way and just let them get stuff done." The primary interfaces to property graphs are JSON-style APIs that developers are comfortable with.

### The Counter-Argument for RDF

On r/semanticweb, defenders note RDF's continued relevance in specific domains:
> "Practically every standard from the OGC, TDWG, virtual observatories, national species lists, the Getty or other scientific or cultural sources tends towards resolvable URIs and some RDF in the background. It's easy to see why. Knowing what something really means is vitally important in handling and aggregating scientific and cultural data." (u/orlock, +16)

And a nuanced view from r/KnowledgeGraph:
> "The Semantic Web stack is the same stack that is powering enterprise Knowledge Graphs and serves as SoT for RAG and LLM agents. So one moniker was sunset and the other appeared but the technology stayed more or less the same because it was always conceptually sound." (u/namedgraph, +6)

### Key Takeaway

The debate is less about technical capability and more about **cultural adoption and developer ergonomics**. Property graphs dominate in enterprise/application contexts. RDF persists in scientific, cultural heritage, and data integration contexts where formal semantics matter. The communities largely talk past each other.

---

## 2. Developer Frustration with RDF/SPARQL

### r/semanticweb: "Honest question: has the semantic web failed?" (Feb 2026)

This thread (43 upvotes, 94% upvote ratio) from u/_juan_carlos_ is one of the most candid assessments from someone working in the field:

> "My observations regarding the semantic web and RDF are not so good. There is an acute lack of support and expertise in all fronts. The libraries are scarce and often buggy, the people working in the area often lack a solid understanding and in general the entire development environment feels outdated and poorly maintained."

> "Even dealing with the poor tooling and libraries, the specifications are in shambles. Take for example FOAF. The specification itself is poor, the descriptions are so vague and it seems everyone has a different understanding of what it specifies."

**Community responses:**

u/Rare-Satisfaction-82 (+3): "Several open source implementations were developed in academia. When students graduate or professors move on to other topics, projects languish. Often, implementations do not interoperate."

And critically: "The biggest issue that I encountered: **the complexity is beyond the understanding of business experts.** Therefore, to create a knowledge base, an ontology super expert must interview business experts."

u/open_risk (+3): "'Semantic Web' as a buzzword and a particular set of technology implementations has obviously failed, its been around for decades without a single notable so-called 'killer app' that sees wider adoption."

u/Then_Influence6638 (+7): "**It feels like LLM search has leapfrogged SW**, but SW technology is finding its way into knowledge graph augmentation of LLMs. Kind of like how expert systems fell by the wayside."

### Hacker News: "The Semantic Web is Dead" and "What happened to the semantic web?"

**HN thread on Semantic Web's death (2022):**

A humanities researcher working with OWL:
> "Debugging OWL is a nightmare. I have no way to hold the reasoner to account" and cannot ask it to explain its inferences, forcing manual verification of all results.

On schema agreement:
> "You can't get everyone to agree on one schema. Period. Even if everyone is motivated to, they can't agree."

**HN thread: "What happened to the semantic web?" (2018):**

Multiple developers identified **lack of commercial incentive** as the root cause:
> "Business reasons (really companies are not incentivized to share)" kept the semantic web from mainstream adoption.

On the technology itself:
> "Most technologies that were specific to the 'Semantic Web', such as OWL and SPARQL, **failed to scale and failed to solve realistic problems**, and therefore died."

On the human cost:
> One engineer spent "3 person years" on an events ontology that ultimately proved not valuable.

**What survived:** JSON-LD emerged as the practical successor, enabling real applications like airline flight notifications in Gmail.

### Key Frustration Patterns

1. **Tooling is awful:** Libraries are buggy, poorly maintained, academic abandonware
2. **Complexity barrier:** Business experts can't understand it, requiring intermediary ontology experts
3. **Schema wars:** No agreement on schemas across organizations
4. **No commercial incentive:** Why would companies expose structured data for competitors?
5. **Debugging nightmare:** OWL reasoners are black boxes
6. **Cost/benefit mismatch:** Massive investment, questionable returns for most use cases

---

## 3. Developer Frustration with Property Graphs / Neo4j

### Scaling Problems

From Neo4j community forums and Medium posts, the core issues:

- **Write performance at scale:** "Extremely expensive to replicate entire graph across each node." MERGE queries become very slow at meaningful scale due to nested loop joins.
- **Sharding is fundamentally hard:** "In a graph database, having relations between the node is the point. That makes sharding more complicated because unless you store the entire graph on a single machine, you are forced to query across machine boundaries."
- **Performance degradation:** Users report that Neo4j databases with ~44M nodes and ~200M relationships suffer from poor performance during aggregation queries.

From r/MachineLearning:
> "From what I know, scalability (performance/reliability) is one of the limiting factors for graph based DBs for any production based implementation." (u/hugganao, +4)

### The Missing Pieces

The most insightful criticism on HN about property graphs for AI:
> Property graphs lack the **formal semantics** that would make them useful for reasoning. They are great for traversal and analytics but don't inherently encode meaning.

From HN discussions on Graphiti (temporal knowledge graphs):
> "The ontology is already well defined in a lot of cases which is 80% of the battle" and without standardized schema support, "LLM <> KG integration will not live up to its potential."

> **Non-deterministic output:** LLM-generated property graph schemas vary with each run, making resulting graphs unreliable for computational reuse.

### Key Frustration Patterns

1. **Scaling writes is painful:** Graph replication across clusters is expensive
2. **Sharding is nearly impossible:** You can shard data but not relationships
3. **No formal semantics:** Great for traversal, weak on reasoning
4. **Schema inconsistency:** LLM-generated property graphs are non-deterministic
5. **Cost at scale:** Enterprise Neo4j licensing is expensive

---

## 4. TrustGraph: Community Sentiment

### Hacker News "Show HN" (October 2024)

The TrustGraph Show HN thread ([HN #41765150](https://news.ycombinator.com/item?id=41765150)) received predominantly positive but limited engagement:

- **u/TaterTots** (positive): "Very interesting project! What's different about how this builds knowledge graphs from other projects?"
- Creator responses focused on technical details: RDF structuring, Cassandra/Neo4j storage backends, chunking strategies
- The biggest discussion was about **chunking strategies** (semantic vs token-based), where the TrustGraph creator noted: "The biggest issue I have with semantic chunking is that it requires a LLM to help create the breakpoints."
- **No significant criticism emerged** in the thread, though engagement was limited

### Reddit r/KnowledgeGraph: "Context Graph Manifesto" (Jan 2025)

TrustGraph's own post about "Context Graphs: The Trillion Dollar Opportunity" ([r/KnowledgeGraph, 41 upvotes, 86% upvote ratio](https://www.reddit.com/r/KnowledgeGraph/comments/1q0osth/what_are_context_graphs_the_trilliondollar/)):

**Skepticism was present but respectful:**

u/micseydel (+2): "'Build intelligent AI applications that reason, not hallucinate.' This sounds unbelievable. How specifically are you applying this in your life? I looked at your readme, but I didn't see anything that answers this question."

u/watchmanstower (+11): Complained about the manifesto being posted on X/Twitter instead of a proper website: "Who wants to read long form on X where I can't save?"

u/nikoraes (+5) asked technical questions about ontology validation: "It seems like the ontology RAG approach you describe requires you to define your ontology upfront. Is this RDF? Do you already validate what the agent tries to store against this ontology?"

u/sdhnshu (+2) was enthusiastic: "I believe trustgraph is the only oss project that is close enough a solution to build for the 'trillion dollar opportunity'"

### TrustGraph's Reddit Presence

TrustGraph posts regularly on r/KnowledgeGraph and r/LLMDevs. Their posts on topics like "Reification for Context Graphs" and "Context Graphs: A Video Discussion" get moderate engagement (7-11 upvotes, 100% upvote ratio on some) but limited comments. The community seems interested but not yet deeply engaged.

### Key Assessment

TrustGraph has **mindshare but not yet significant traction in developer communities.** The project is respected for tackling a real problem, but lacks the volume of independent user testimonials or criticism that would indicate wide adoption. Most discussion happens in niche knowledge graph communities rather than mainstream developer forums.

---

## 5. "Context Engineering" Discourse

### Hacker News: "The new skill in AI is not prompting, it's context engineering" (June 2025)

This was a major HN thread ([#44427757](https://news.ycombinator.com/item?id=44427757)) that sparked significant debate:

**Skepticism about the term itself:**
> "Pointless pedantry" (one commenter)
> Another compared it to "Founder Mode" that disappeared within months

**The technical reality check:**
> To the model "there is no difference" between context and prompt. They're both just tokens in the window.
> Context engineering still amounts to "tinkering in non-deterministic space" without scientific grounding.

**The "it's still hacking" camp:**
> "These aren't released and even then you'll always need glue code"
> People are "layering of hacks" rather than using principled approaches

**The practical value camp:**
> Managing context throughout an agent's execution differs meaningfully from initial prompt crafting
> Context windows plateau around 10k tokens for reliable accuracy despite larger advertised limits

**The humorous dismissal:**
> One commenter characterized it as **"Ouija boards with statistical machinery."**

### HN: "Context engineering isn't a rebranding, it's a widening of scope"

u/hnlmorg argued: "Like how all squares are rectangles, but not all rectangles are squares; prompt engineering is context engineering but context engineering also includes other optimisations."

But also noted the practical concern: **"people move on before they question whether this hack will still work in a months time."**

### HN: "Biggest challenges with context engineering for AI agents"

The original poster identified three real pain points:
1. **"Debugging what the agent actually saw at decision time"** remains difficult
2. **"Managing context across multi-agent patterns"** creates coordination complexity
3. **"Keeping history without blowing up storage"** is a tension between useful context and cost

### Reddit r/ContextEngineering

A dedicated subreddit now exists (r/ContextEngineering), with posts like:
> "MIT study says AI made devs faster but more wrong. This feels less like a 'prompting' problem and more like a context problem." (24 upvotes, 100% upvote ratio)

### Key Assessment

The community is **split roughly 50/50 between "this is a meaningful evolution" and "this is just rebranded prompt engineering."** The practitioners who find value tend to be building multi-agent systems. The skeptics tend to be individual developers or researchers who see it as marketing.

---

## 6. Knowledge Graphs for RAG: Practitioner Reality

### HN: "GraphRAG is now on GitHub" (Microsoft Open Source, July 2024)

([#40857174](https://news.ycombinator.com/item?id=40857174)) This was a high-engagement thread:

**Excitement:**
> "I am ecstatic that Microsoft open sourced this...I think this tool could be a legit game changer."

**Critical concerns:**

On code quality:
> "A bit of a red flag that it doesn't use an established parsing and validation library" like Pydantic

On cost:
> "Compute requirements here untenable for any decent sized dataset?" Running LLMs for extraction costs ~$15 per run, and "the answer better be very good and relevant every time."

On knowledge graph quality:
> "If you build the Knowledge Graph in a 'naive' way...you'll probably end up with a very 'dirty' Knowledge Graph full with duplications."

### HN: "Knowledge Graphs in RAG: Hype vs. Ragas Analysis"

([#40921038](https://news.ycombinator.com/item?id=40921038)):

**Key insight:**
> "LLMs already partially encode information as semantic graphs internally," suggesting external graphs might offer **less value than assumed.**

**Consensus:** Knowledge graphs aren't hype-free or useless. They're being tested incorrectly against overly simple problems. Their real value is for multi-hop reasoning over large corpora (1M+ tokens).

### HN: KAG (Knowledge Graph RAG Framework)

([#42545986](https://news.ycombinator.com/item?id=42545986)):

The most cutting criticism:
> "They never solve the first problem I have, which is **actually constructing the KG itself.**"

On the LLM-generated knowledge graph paradox:
> "A cyclical hallucination problem. The LLM hallucinates and creates incorrect graph which in turn creates even more incorrect knowledge."

On practical testing:
> Legal tech developers found "the result to be an absolute mess" because tools lack domain-specific adaptation.

### r/LocalLLaMA: Graph RAG for Local Models

From r/LocalLLaMA discussions, the practical consensus:
- **Property graphs (Neo4j) are preferred** for RAG over RDF because of developer familiarity
- Entity disambiguation remains the core unsolved problem
- Local LLMs produce lower quality knowledge graphs than cloud models
- Several practitioners report success with manually curated small graphs (<10K nodes) but struggle at scale

u/vagobond45 in r/LocalLLaMA built "a medical graph information map with ~5k nodes and ~25k edges" and asked the community about SLM integration, getting 11 comments worth of practical discussion.

### Key Assessment

**The practitioner consensus: Knowledge graphs for RAG work in theory but the construction problem is unsolved.** LLM-generated graphs are messy, expensive, and introduce their own hallucination loops. Hand-crafted domain-specific graphs work well but don't scale. The gap between demo and production remains enormous.

---

## 7. Ontologies for AI/LLM: Useful or Overhead?

### r/MachineLearning: "Turning Knowledge Graphs into Memory with Ontologies?"

([r/MachineLearning, 37 upvotes](https://www.reddit.com/r/MachineLearning/comments/1jot2zr/dp_turning_knowledge_graphs_into_memory_with/)):

The top comment was a sharp pushback on the neuroscience framing:
> "This claim appears to be using the authority of neuroscience to justify a particular approach to AI system design (symbolic knowledge representation using RDF/OWL ontologies), when the connection between biological cognition and this specific technical approach is far from established." (u/marr75, +26)

But the "neuro-symbolic" camp responded:
> "This is the way. We need neural methods that translate between language and grounded systems, and symbolic methods to reason over knowledge." (u/RareMemeCollector, +6)

And a practical result:
> "We've been researching a similar area and results so far are promising. Retrieval accuracy up by 30-40% over RAG, at levels comparable to human recall." (u/damhack, +1)

### HN: Ontology-Driven Knowledge Graph Extraction

The TrustGraph "Show HN" for ontology-driven extraction ([#46032953](https://news.ycombinator.com/item?id=46032953)) was submitted but received minimal community engagement at the time of research, which itself is a data point.

### HN: Graphiti (Temporal Knowledge Graphs)

On ontologies specifically:
> "The ontology is already well defined in a lot of cases which is 80% of the battle." Multiple developers emphasized that predetermined schemas solve the non-deterministic output problem that plagues LLM-generated graphs.

### HN: Real-Time Knowledge Graphs with LLMs

The fundamental skepticism about LLM-generated ontologies:
> "Using an open language model to produce a graph doesn't create a closed world graph by definition." (th0ma5)

On practical alternatives:
> One developer advocates "a file that contains a list of Entity-Attribute-Value assertions in triplets" as a simpler but effective approach over formal ontologies.

On domain specificity:
> "Knowledge graphs are a must have for security use-cases because of how well they handle many-to-many relationships." Domain-specific use cases with clear ontologies show the strongest results.

### Key Assessment

The community is **pragmatically split:**

**Ontologies are useful when:**
- The domain has well-established vocabularies (healthcare, legal, scientific)
- You need formal validation of LLM outputs
- You need interoperability across systems
- You have ontology expertise available

**Ontologies are overhead when:**
- You're building a general-purpose AI application
- Your team lacks ontology engineering expertise
- You need to move fast and iterate
- The domain doesn't have established vocabularies

The strongest signal: **LLM-generated ontologies are widely distrusted.** The community wants either human-curated ontologies or simpler alternatives (plain triples, schema-constrained extraction). The middle ground of "let the LLM figure out the ontology" is seen as producing unreliable results.

---

## Summary: Cross-Cutting Themes

### 1. The Construction Problem is Unsolved
Across all threads, the single biggest complaint: building knowledge graphs (whether RDF or property graph) from unstructured data remains extremely hard. LLMs help but introduce their own quality problems.

### 2. Developer Experience Wins Over Technical Elegance
Property graphs dominate not because they're technically superior, but because developers can actually use them. RDF's formal elegance means nothing if people can't build with it.

### 3. The Demo-to-Production Gap is Enormous
GraphRAG, knowledge graph RAG, and context graphs all look impressive in demos. Getting them to work reliably in production is a different story entirely. "The result was an absolute mess" is a common refrain.

### 4. Domain Specificity is the Key Success Factor
Every success story involves a well-defined domain (security, healthcare, finance, cultural heritage). Generic "build a knowledge graph from anything" approaches consistently disappoint.

### 5. The Community Wants Pragmatic Tools, Not Academic Standards
The clearest signal: practitioners want tools that work, not standards that are theoretically beautiful. JSON-LD survived where OWL didn't because it was practical. Property graphs beat RDF in adoption because they were developer-friendly.

### 6. Trust/Provenance is an Emerging Need
TrustGraph's focus on provenance and auditability resonates with the community, even if adoption is early. As AI becomes more regulated, this need will grow.

### 7. Context Engineering is Real But Overhyped
The underlying problem (giving AI the right information) is genuine. The term may or may not stick. What matters is that builders are grappling with the same core challenge: how to reliably provide structured context to LLMs.

---

## Source URLs

### Reddit Threads
- [r/semanticweb: "Honest question: has the semantic web failed?"](https://www.reddit.com/r/semanticweb/comments/1qorqt0/honest_question_has_the_semantic_web_failed/) (Feb 2026, 43 upvotes)
- [r/MachineLearning: "Thoughts on knowledge graphs and graph neural networks"](https://www.reddit.com/r/MachineLearning/comments/1eg674y/discussion_thoughts_on_knowledge_graphs_and_graph/) (Jul 2024, 83 upvotes, 42 comments)
- [r/MachineLearning: "Turning Knowledge Graphs into Memory with Ontologies?"](https://www.reddit.com/r/MachineLearning/comments/1jot2zr/dp_turning_knowledge_graphs_into_memory_with/) (Apr 2025, 37 upvotes, 21 comments)
- [r/KnowledgeGraph: "What are Context Graphs? The trillion-dollar opportunity?"](https://www.reddit.com/r/KnowledgeGraph/comments/1q0osth/what_are_context_graphs_the_trilliondollar/) (Jan 2025, 41 upvotes, 23 comments)
- [r/KnowledgeGraph: "Context Graphs: A Video Discussion"](https://www.reddit.com/r/KnowledgeGraph/comments/1q4akmq/context_graphs_a_video_discussion/) (Jan 2025, 11 upvotes)
- [r/KnowledgeGraph: "Reification for Context Graphs"](https://www.reddit.com/r/KnowledgeGraph/comments/1q7yep4/reification_for_context_graphs/) (Jan 2025, 7 upvotes)
- [r/LLMDevs: "Build, Manage, and Deploy Context Graphs"](https://www.reddit.com/r/LLMDevs/comments/1q1jto5/build_manage_and_deploy_context_graphs_free_and/) (Jan 2025, TrustGraph post)
- [r/LLMDevs: "I Built RAG Systems for Enterprises (20K+ Docs)"](https://www.reddit.com/r/LLMDevs/comments/1nl9oxo/i_built_rag_systems_for_enterprises_20k_docs/) (Jun 2025, 832 upvotes)
- [r/LocalLLaMA: "Codebase to Knowledge Graph generator"](https://www.reddit.com/r/LocalLLaMA/comments/1mzvk44/codebase_to_knowledge_graph_generator/) (Jun 2025, 64 upvotes)
- [r/LocalLLaMA: "Using Knowledge Graphs to create personas"](https://www.reddit.com/r/LocalLLaMA/comments/1lcoewz/using_knowledge_graphs_to_create_personas/) (May 2025, 11 upvotes)
- [r/LocalLLaMA: "How good is using local LLMs for knowledge graphs?"](https://www.reddit.com/r/LocalLLaMA/comments/1qh5zy5/how_good_is_the_approach_of_using_local_llms_for/) (Feb 2026, 6 upvotes)
- [r/LocalLLaMA: "Graph Rag Medical SLM"](https://www.reddit.com/r/LocalLLaMA/comments/1pqkatp/graph_rag_medical_slm/) (Jul 2025, 5 upvotes)
- [r/semanticweb: "Web Knowledge Graph Standard: RDF/SPARQL endpoints for AI agents"](https://www.reddit.com/r/semanticweb/comments/1q3z2ed/web_knowledge_graph_standard_rdfsparql_endpoints/) (Jan 2025, 12 upvotes)
- [r/semanticweb: "Career in semantic web/ontology engineering compared to ML?"](https://www.reddit.com/r/semanticweb/comments/1qoc5cj/career_in_semantic_webontology_engineering/) (Feb 2026, 22 upvotes)
- [r/ContextEngineering: "MIT study says AI made devs faster but more wrong"](https://www.reddit.com/r/ContextEngineering/comments/1ov0km5/mit_study_says_ai_made_devs_faster_but_more_wrong/) (Jul 2025, 24 upvotes)

### Hacker News Threads
- [HN: "The new skill in AI is not prompting, it's context engineering"](https://news.ycombinator.com/item?id=44427757) (Jun 2025, major discussion)
- [HN: "GraphRAG is now on GitHub"](https://news.ycombinator.com/item?id=40857174) (Jul 2024, Microsoft open source)
- [HN: "KAG: Knowledge Graph RAG Framework"](https://news.ycombinator.com/item?id=42545986) (Dec 2024)
- [HN: "Knowledge Graphs in RAG: Hype vs. Ragas Analysis"](https://news.ycombinator.com/item?id=40921038) (Jul 2024)
- [HN: "Show HN: Graphiti - LLM-Powered Temporal Knowledge Graphs"](https://news.ycombinator.com/item?id=41445445) (Sep 2024)
- [HN: "Show HN: TrustGraph - Do More with AI with Less"](https://news.ycombinator.com/item?id=41765150) (Oct 2024)
- [HN: "The semantic web is dead - Long live the semantic web"](https://news.ycombinator.com/item?id=32412803) (Aug 2022)
- [HN: "Ask HN: What happened to the semantic web?"](https://news.ycombinator.com/item?id=16806657) (Apr 2018)
- [HN: "Build real-time knowledge graph for documents with LLM"](https://news.ycombinator.com/item?id=43976895) (2025)
- [HN: "Ask HN: Anyone using knowledge graphs for LLM agent memory/context management?"](https://news.ycombinator.com/item?id=43940654) (2025)
- [HN: "Show HN: Ontology-driven knowledge graph extraction from text"](https://news.ycombinator.com/item?id=46032953) (TrustGraph, 2025)
- [HN: "Ask HN: What's your biggest challenge with context engineering for AI agents?"](https://news.ycombinator.com/item?id=46707675) (2025)
- [HN: "Context engineering isn't a rebranding, it's a widening of scope"](https://news.ycombinator.com/item?id=44462128) (Jun 2025)
- [HN: "Reflections on AI at the End of 2025"](https://news.ycombinator.com/item?id=46334819) (Dec 2025)

### Other Sources
- [The Semantic Web and why it failed](https://data-mining.philippe-fournier-viger.com/the-semantic-web-and-why-it-failed/)
- [The Semantic Web is Dead - Long Live the Semantic Web (TerminusDB)](https://terminusdb.com/blog/the-semantic-web-is-dead/)
- [Designing a Linked Data developer experience (Ruben Verborgh)](https://ruben.verborgh.org/blog/2018/12/28/designing-a-linked-data-developer-experience/)
- [TrustGraph Context Graph Manifesto](https://trustgraph.ai/news/context-graph-manifesto/)
- [TrustGraph GitHub](https://github.com/trustgraph-ai/trustgraph)
- [TrustGraph + Qdrant Case Study](https://qdrant.tech/blog/case-study-trustgraph/)
- [TrustGraph + Memgraph](https://memgraph.com/blog/trustgraph-memgraph-knowledge-retrieval-complex-industries)
- [Some Context on Context Graphs (GraphRAG Curator)](https://graphrag.info/2026/01/28/some-context-on-context-graphs/)
- [Context Engineering: From Prompt Hacking to Cognitive Architectures (Medium)](https://medium.com/data-science-collective/the-evolution-of-context-engineering-from-prompt-hacking-to-cognitive-architectures-14eb17243ef5)
- [We Tried to Scale Neo4j (Medium)](https://medium.com/@kanishks772/we-tried-to-scale-neo4j-heres-what-worked-what-failed-and-what-we-d-never-do-again-56cfaa89970f)
