import { evaluateScript } from './evaluate-script';
import { waitForDgraph, loadSchema, runQuery } from './test-utils'
import sleep from 'sleep-promise';

const integrationTest = process.env.INTEGRATION_TEST === "true" ? describe : describe.skip;

describe(evaluateScript, () => {
  it("returns undefined if there was no event", async () => {
    const runScript = evaluateScript("")
    expect(await runScript({type: "Query.unknown", args: [], parents: [null]})).toBeUndefined()
  })

  it("returns the value if there was a resolver registered", async () => {
    const runScript = evaluateScript(`addGraphQLResolvers({
      "Query.fortyTwo": ({parents}) => parents.map(() => 42)
    })`)
    expect(await runScript({ type: "Query.fortyTwo", args: [], parents: [null] })).toEqual([42])
  })

  it("passes the args and parents over", async () => {
    const runScript = evaluateScript(`addGraphQLResolvers({
      "User.fortyTwo": ({parents, args}) => parents.map(({n}) => n + args[0])
    })`)
    expect(await runScript({ type: "User.fortyTwo", args: [1], parents: [{n: 41}] })).toEqual([42])
  })

  it("returns undefined if the number of parents doesn't match the number of return types", async () => {
    const runScript = evaluateScript(`addGraphQLResolvers({
      "Query.fortyTwo": () => [41, 42]
    })`)
    expect(await runScript({ type: "Query.fortyTwo", args: [], parents: [null] })).toBeUndefined()
  })

  it("returns undefined somehow the script doesn't return an array", async () => {
    const runScript = evaluateScript(`addGraphQLResolvers({
      "User.fortyTwo": () => ({})
    })`)
    expect(await runScript({ type: "User.fortyTwo", args: [], parents: [{n: 42}] })).toBeUndefined()
  })

  integrationTest("dgraph integration", () => {
    beforeAll(async () => {
      await waitForDgraph();
      await loadSchema(`type Todo { id: ID!, title: String! }`)
      await sleep(250)
      await runQuery(`mutation { addTodo(input: [{title: "Kick Ass"}, {title: "Chew Bubblegum"}]) { numUids } }`)
    })

    it("works with dgraph graphql", async () => {
      const runScript = evaluateScript(`
        async function todoTitles({parents, graphql}) {
          return parents.map(async () => {
            const results = await graphql('{ queryTodo { title } }')
            return results.data.queryTodo.map(t => t.title)
          })
        }
        addGraphQLResolvers({ "Query.todoTitles": todoTitles })`)
      const results = await runScript({ type: "Query.todoTitles", args: [], parents: [null] });
      expect(new Set(results && results[0])).toEqual(new Set(["Kick Ass", "Chew Bubblegum"]))
    })

    it("works with dgraph dql", async () => {
      const runScript = evaluateScript(`
        async function todoTitles({parents, dql}) {
          return parents.map(async () => {
            const results = await dql('{ queryTitles(func: type(Todo)){ Todo.title } }')
            return results.data.queryTitles.map(t => t["Todo.title"])
          })
        }
        addGraphQLResolvers({ "Query.todoTitles": todoTitles })`)
      const results = await runScript({ type: "Query.todoTitles", args: [], parents: [null] });
      expect(new Set(results && results[0])).toEqual(new Set(["Kick Ass", "Chew Bubblegum"]))
    })
  })
})
