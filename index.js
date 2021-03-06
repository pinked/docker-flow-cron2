const Docker = require('node-docker-api').Docker
const Promise = require('bluebird')
const docker = new Docker({socketPath: '/var/run/docker.sock'})
const cron = require('node-cron')
const _ = require('lodash')
const Health = require('healthful')
const health = new Health({service: 'cron_runner', http: true, interval: 30 * 1000})

const tasks = []

const getServiceSchedule = service => service.data.Spec.TaskTemplate.ContainerSpec.Labels['com.df.schedule']
const getServiceName = service => service.data.Spec.Name

const scheduleService = (service) => tasks.push({
  name: getServiceName(service),
  schedule: getServiceSchedule(service),
  job: cron.schedule(getServiceSchedule(service), () => restartService(service))
})

const removeOldTasks = (services) => {
  let services_schedules = {}
  _.each(services, service => services_schedules[getServiceName(service)] = getServiceSchedule(service))
  _.each(tasks, (task, i) => {
    if (!services_schedules[task.name] || services_schedules[task.name] !== task.schedule) {
      console.log(`Removing ${task.name}`)
      task.job.destroy()
      tasks.splice(i, 1)
    }
  })
  return services
}

const log_current_tasks = () => console.log({'current tasks': tasks})

const updateCronTable = () => Promise.resolve(docker.service.list())
  .filter(service => service.data.Spec.TaskTemplate.ContainerSpec.Labels['com.df.cron2'] === 'true')
  .tap(removeOldTasks)
  .filter(noChangedServices)
  .each(scheduleService)
  .then(log_current_tasks)

const noChangedServices = service => !_.find(tasks, {
  name: getServiceName(service),
  schedule: getServiceSchedule(service)
})

const restartService = service =>
  Promise.resolve(setServiceReplicas(service, 0))
    .then(() => setServiceReplicas(service, 1))

const setServiceReplicas = (s, replicas) =>
  s.status()
    .then(service => {
      let spec = service.data.Spec
      spec.Mode.Replicated.Replicas = replicas
      spec.version = service.data.Version.Index
      console.log(`Setting ${service.data.Spec.Name} to ${replicas} replicas`)
      return service.update(spec)
    })

cron.schedule(process.env.DF_UPDATE_SCHEDULE, updateCronTable, true)

cron.schedule("* * * * * * *", () => health.ping())
